/**
 * Getters for the VoibosTools module.
 * @module addons/voibosTools/store/gettersVoibosTools
 */
const getters = {
    description: state => state.description,
    icon: state => state.icon,
    hasMouseMapInteractions: state => state.hasMouseMapInteractions,
    name: state => state.name,
    supportedDevices: state => state.supportedDevices,
    supportedMapModes: state => state.supportedMapModes,
    type: state => state.type,
    activeTab: state => state.activeTab,
    loading: state => state.loading,
    errorMessage: state => state.errorMessage
};

export default getters;
