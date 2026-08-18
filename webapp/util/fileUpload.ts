import FileUploader from "sap/ui/unified/FileUploader";
import FileUploaderParameter from "sap/ui/unified/FileUploaderParameter";
import type { FileUploader$UploadCompleteEvent } from "sap/ui/unified/FileUploader";
import { AuthenticationService } from "../auth/AuthenticationService";

/**
 * Applies the authenticated request headers onto the given uploader. The
 * headerParameters are refreshed right before every upload so the session token
 * is always current (e.g. after a token refresh). CAP does not issue CSRF
 * tokens, so only the Authorization header is sent.
 *
 * @param {FileUploader} uploader the uploader that will send the request
 */
function applyAuthHeaders(uploader: FileUploader): void {
    const token = AuthenticationService.getSession()?.accessToken || "";
    uploader.destroyHeaderParameters();
    uploader.addHeaderParameter(
        new FileUploaderParameter({ name: "Authorization", value: token ? `Bearer ${token}` : "" })
    );
}

/**
 * Uploads the file currently selected in the given uploader to `uploadUrl`
 * using the FileUploader's own upload transport (PUT with `useMultipart=false`,
 * i.e. the raw file bytes as `application/octet-stream`, which the CAP media
 * endpoint accepts). The uploader must be configured with `sendXHR="true"` so
 * the `uploadComplete` event fires.
 *
 * @param {FileUploader} uploader the uploader holding the chosen file
 * @param {string} uploadUrl the OData media target path relative to the service, e.g. "Cards(ID='..',IsActiveEntity=false)/Image"
 * @returns {Promise<boolean>} whether the upload completed with a 2xx status
 */
export function uploadNow(uploader: FileUploader, uploadUrl: string): Promise<boolean> {
    if (!uploader.getValue()) {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const onComplete = (event: FileUploader$UploadCompleteEvent): void => {
            uploader.detachUploadComplete(onComplete);
            const status = event.getParameter("status");
            if (status === 401) {
                AuthenticationService.notifySessionExpired();
            }
            resolve(typeof status === "number" && status >= 200 && status < 300);
        };
        const cleanup = (): void => {
            uploader.detachUploadComplete(onComplete);
        };

        uploader.attachUploadComplete(onComplete);
        uploader.setUploadUrl(uploadUrl);
        applyAuthHeaders(uploader);

        try {
            uploader.upload();
        } catch {
            cleanup();
            resolve(false);
        }
    });
}
