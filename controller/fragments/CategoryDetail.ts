import Control from "sap/ui/core/Control";
import Dialog from "sap/m/Dialog";

const CategoryDetail = {
    onFecharCategoria: function (this: Control): void {
        (this.getParent() as Dialog).close();
    }
};

export default CategoryDetail;
