import {
  createCatalogItem,
  deleteCatalogItem,
  updateCatalogItem
} from "../../../api";

export const productsAdminService = {
  create: createCatalogItem,
  update: updateCatalogItem,
  remove: deleteCatalogItem
};
