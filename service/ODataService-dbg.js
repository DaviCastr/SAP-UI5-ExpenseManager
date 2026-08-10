sap.ui.define(["../util/http"], function (___util_http) {
  "use strict";

  const request = ___util_http["request"];
  /**
   * CAP controllers reply with a `{ data, status }` envelope (BaseControllerResponse).
   * Unwraps the payload so callers receive the actual function/action result.
   *
   * @param {unknown} value the raw value returned by the OData model
   * @returns {unknown} the unwrapped payload (or the original value when not an envelope)
   */
  function unwrapControllerResult(value) {
    // eslint-disable-next-line no-console
    console.log("[unwrapControllerResult] value:", value);
    if (value && typeof value === "object" && "data" in value && "status" in value) {
      return value.data;
    }
    return value;
  }

  /**
   * Draft-aware query options for draft-enabled entities.
   *
   * The filter lists active entities together with drafts that have no active
   * sibling, without duplicating entities that exist in both versions.
   */
  const DRAFT_FILTER = "(IsActiveEntity eq true or SiblingEntity/IsActiveEntity eq null)";
  const DRAFT_EXPAND = "DraftAdministrativeData($select=DraftUUID,InProcessByUser)";
  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  function unwrapBindingObject(value) {
    return value && typeof value === "object" ? value : {};
  }

  /**
   * Thin, typed wrapper around the shared OData V4 model.
   *
   * Every read/write the application performs against the CAP backend goes
   * through this class so the controllers never deal with raw bindings.
   */
  class ODataService {
    constructor(model) {
      this.model = model;
    }
    getModel() {
      return this.model;
    }
    getServiceUrl() {
      return this.model.getServiceUrl();
    }
    async requestEntitySet(entitySet, parameters) {
      const bindingParameters = {};
      if (parameters?.select?.length) {
        bindingParameters.$select = parameters.select.join(",");
      }
      if (parameters?.expand) {
        bindingParameters.$expand = parameters.expand;
      }
      if (parameters?.count) {
        bindingParameters.$count = "true";
      }
      if (parameters?.filterExpression) {
        bindingParameters.$filter = parameters.filterExpression;
      }
      const binding = this.model.bindList(`/${entitySet}`, undefined, undefined, parameters?.filters, bindingParameters);
      const contexts = await binding.requestContexts();
      return contexts.map(context => context.getObject());
    }
    async requestFunction(path, parameters) {
      const binding = this.model.bindContext(`${path}(...)`);
      for (const [name, value] of Object.entries(parameters)) {
        binding.setParameter(name, value);
      }
      await binding.invoke();
      return unwrapControllerResult(binding.getBoundContext()?.getObject());
    }
    async requestAction(path, parameters) {
      const binding = this.model.bindContext(`${path}(...)`);
      for (const [name, value] of Object.entries(parameters)) {
        binding.setParameter(name, value);
      }
      await binding.invoke();
    }

    // ---------------------------------------------------------------------------
    // Draft handling (shared by every draft-enabled entity, e.g. Persons, Cards,
    // Categories...). The operations run through the OData V4 model so the
    // requests carry the headers CAP expects (Content-Type, Prefer, ETag) and the
    // model's own CSRF handling. For derived entities that are compositions of
    // Persons, pass "Persons" as entitySet with the person ID and the composition
    // body in `updates` — the draft path is always based on the root entity.
    // ---------------------------------------------------------------------------

    entityPath(entitySet, id, isActiveEntity) {
      return `${entitySet}(ID='${encodeURIComponent(id)}',IsActiveEntity=${isActiveEntity})`;
    }

    /**
     * Returns the qualified name of a bound action (e.g. "ExpenseManager.draftEdit").
     * Bound actions must be bound by their qualified name, otherwise the meta
     * model cannot resolve the operation and invocation fails with
     * "Unknown operation".
     *
     * @param {string} entitySet the entity set of the bound action, e.g. "Persons"
     * @param {string} actionName the simple action name, e.g. "draftEdit"
     * @returns {string} the qualified action name
     */
    qualifiedActionName(entitySet, actionName) {
      const metaModel = this.model.getMetaModel();
      const entityType = metaModel.getObject(`/${entitySet}/$Type`);
      if (typeof entityType !== "string" || !entityType.includes(".")) {
        throw new Error(`Não foi possível resolver o namespace da entidade ${entitySet}.`);
      }
      return `${entityType.slice(0, entityType.lastIndexOf("."))}.${actionName}`;
    }

    /**
     * Resolves the entity (parent) context and returns a deferred operation
     * binding for a bound action of that entity. A bound action can only be
     * invoked once its parent context is resolved, so the entity is read first.
     *
     * @param {string} entitySet the draft-enabled entity set, e.g. "Persons"
     * @param {string} id the entity key
     * @param {boolean} isActiveEntity whether to bind the active or the draft entity
     * @param {string} actionName the bound action name (e.g. "draftEdit")
     * @param {Record<string, unknown>} [parameters] action parameters
     * @returns {Promise<ODataContextBinding>} the deferred operation binding
     */
    async bindBoundAction(entitySet, id, isActiveEntity, actionName, parameters) {
      const entityBinding = this.model.bindContext(this.entityPath(`/${entitySet}`, id, isActiveEntity));
      await entityBinding.requestObject();
      const entityContext = entityBinding.getBoundContext();
      if (!entityContext) {
        throw new Error(`Entidade ${entitySet} (${id}) não pôde ser carregada.`);
      }
      const actionBinding = this.model.bindContext(`${this.qualifiedActionName(entitySet, actionName)}(...)`, entityContext);
      if (parameters) {
        for (const [name, value] of Object.entries(parameters)) {
          actionBinding.setParameter(name, value);
        }
      }
      return actionBinding;
    }

    /**
     * Tells whether the given error means "a draft for this entity already
     * exists" (HTTP 409). Opening a draft that is already open is harmless, so
     * the flow can continue with the existing draft.
     *
     * @param {unknown} error the error raised by the OData model
     * @returns {boolean} whether the draft already exists
     */
    isDraftAlreadyExistsError(error) {
      const cause = error;
      const status = cause.status ?? cause.cause?.status;
      const message = `${cause.message ?? ""} ${cause.cause?.message ?? ""}`;
      return status === 409 && /already exists/i.test(message);
    }

    /**
     * Opens a draft of the active entity so it can be edited
     * (POST <entity>(ID,IsActiveEntity=true)/draftEdit with PreserveChanges).
     * When a draft is already open the backend answers with 409
     * ("A draft for this entity already exists"), which is fine: the flow just
     * continues with the existing draft.
     *
     * @param {string} entitySet the draft-enabled entity set, e.g. "Persons"
     * @param {string} id the entity key
     * @returns {Promise<void>} resolves once the draft is created (or already exists)
     */
    async enableDraftEdit(entitySet, id) {
      const binding = await this.bindBoundAction(entitySet, id, true, "draftEdit", {
        PreserveChanges: true
      });
      try {
        await binding.invoke();
      } catch (error) {
        if (!this.isDraftAlreadyExistsError(error)) {
          throw error;
        }
      }
    }

    /**
     * Persists the given properties to the draft entity
     * (PATCH <entity>(ID,IsActiveEntity=false)) through the OData V4 model. The
     * changes are collected in a deferred group and submitted as a single PATCH.
     *
     * @param {string} entitySet the draft-enabled entity set, e.g. "Persons"
     * @param {string} id the entity key
     * @param {Record<string, unknown>} updates the properties to change
     * @returns {Promise<void>} resolves once the PATCH succeeded
     */
    async saveDraft(entitySet, id, updates) {
      const groupId = "draftSave";
      const binding = this.model.bindContext(this.entityPath(`/${entitySet}`, id, false), undefined, {
        $$updateGroupId: groupId
      });
      await binding.requestObject();
      const context = binding.getBoundContext();
      if (!context) {
        throw new Error(`Rascunho de ${entitySet} (${id}) não pôde ser carregado.`);
      }
      const pending = [];
      for (const [name, value] of Object.entries(updates)) {
        pending.push(context.setProperty(name, value));
      }
      await this.model.submitBatch(groupId);
      await Promise.all(pending);
    }

    /**
     * Triggers the backend side effects on the draft
     * (POST <entity>(ID,IsActiveEntity=false)/draftPrepare). Mirrors the standard
     * save flow of Fiori Elements; harmless when the entity has no side effects.
     *
     * @param {string} entitySet the draft-enabled entity set, e.g. "Persons"
     * @param {string} id the entity key
     * @returns {Promise<void>} resolves once the side effects were applied
     */
    async prepareDraft(entitySet, id) {
      const binding = await this.bindBoundAction(entitySet, id, false, "draftPrepare", {
        SideEffectsQualifier: ""
      });
      await binding.invoke(undefined, true);
    }

    /**
     * Publishes the draft into the active entity
     * (POST <entity>(ID,IsActiveEntity=false)/draftActivate).
     *
     * @param {string} entitySet the draft-enabled entity set, e.g. "Persons"
     * @param {string} id the entity key
     * @returns {Promise<void>} resolves once the draft is activated
     */
    async activateDraft(entitySet, id) {
      const binding = await this.bindBoundAction(entitySet, id, false, "draftActivate");
      await binding.invoke(undefined, true);
    }
    getMediaUrl(mediaPath) {
      return `${this.getServiceUrl()}${mediaPath}`;
    }

    /**
     * Resolves an OData media resource to a base64 data URL using the same
     * authenticated OData model. The model carries the Authorization header, so
     * the mídia is fetched with the session token instead of a raw browser
     * request. Returns `undefined` when the media cannot be loaded.
     *
     * @param {string} mediaPath the service-relative media path (e.g. "Categories(ID='..')/Image")
     * @returns {Promise<string | undefined>} a base64 data URL, or `undefined` on failure
     */
    async getMediaAsBase64(mediaPath) {
      if (!mediaPath) {
        return undefined;
      }
      try {
        const binding = this.model.bindContext(this.mediaEntityPath(mediaPath));
        const bound = await binding.requestObject();
        const readLink = this.resolveMediaReadLink(mediaPath, unwrapBindingObject(bound));
        if (!readLink) {
          return undefined;
        }
        const response = await request(this.relativePath(readLink), {});
        if (!response.ok) {
          return undefined;
        }
        const blob = await response.blob();
        return blobToDataUrl(blob);
      } catch {
        return undefined;
      }
    }

    /**
     * Resolves the entity path (media property read link) from a media path.
     *
     * @param {string} mediaPath the relative media path
     * @param {Record<string, unknown>} bound the bound entity data
     * @returns {string | undefined} an absolute media URL, or `undefined`
     */
    resolveMediaReadLink(mediaPath, bound) {
      const readLink = bound["@odata.mediaReadLink"] || bound["@odata.mediaEditLink"];
      if (typeof readLink === "string" && readLink) {
        return readLink;
      }
      return this.getMediaUrl(mediaPath);
    }

    /**
     * Normalizes a service-relative media path into an OData entity path the
     * model can bind against.
     *
     * @param {string} mediaPath the service-relative media path
     * @returns {string} the entity path
     */
    mediaEntityPath(mediaPath) {
      return mediaPath.replace(/\/Image(\/\$value)?$/, "");
    }

    /**
     * Strips an absolute service base from a URL so it can be passed to the
     * authenticated `request` helper. Absolute external URLs are returned as is.
     *
     * @param {string} url the media link to normalize
     * @returns {string} a service-relative (or preserved absolute) URL
     */
    relativePath(url) {
      const base = this.getServiceUrl();
      return url.startsWith(base) ? url.slice(base.length) : url;
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.DRAFT_FILTER = DRAFT_FILTER;
  __exports.DRAFT_EXPAND = DRAFT_EXPAND;
  __exports.ODataService = ODataService;
  return __exports;
});
//# sourceMappingURL=ODataService-dbg.js.map
