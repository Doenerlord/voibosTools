import state from "./stateVoibosTools.js";
import getters from "./gettersVoibosTools.js";
import mutations from "./mutationsVoibosTools.js";
import actions from "./actionsVoibosTools.js";

/**
 * VoibosTools Vuex store module.
 */
export default {
    namespaced: true,
    state: {...state},
    mutations,
    actions,
    getters
};
