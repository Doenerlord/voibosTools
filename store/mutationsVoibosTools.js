/**
 * Mutations for the VoibosTools module.
 * @module addons/voibosTools/store/mutationsVoibosTools
 */
const mutations = {
    setActiveTab (state, tabId) {
        state.activeTab = tabId;
    },
    setLoading (state, loading) {
        state.loading = loading;
    },
    setErrorMessage (state, message) {
        state.errorMessage = message;
    },
    setDescription (state, description) {
        state.description = description;
    },
    setIcon (state, icon) {
        state.icon = icon;
    },
    setName (state, name) {
        state.name = name;
    },
    setHasMouseMapInteractions (state, val) {
        state.hasMouseMapInteractions = val;
    }
};

export default mutations;
