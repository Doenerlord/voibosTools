/**
 * State of the VoibosTools module.
 * @module addons/voibosTools/store/stateVoibosTools
 * @property {String} description The description shown in the menu button.
 * @property {String} icon The Bootstrap Icon class next to the title.
 * @property {Boolean} hasMouseMapInteractions Flag indicating that this module handles mouse map interactions.
 * @property {String} name Displayed title / i18n key.
 * @property {String[]} supportedDevices Devices on which the module is displayed.
 * @property {String[]} supportedMapModes Map modes in which this module can be used.
 * @property {String} type The type/id of the component.
 * @property {String} activeTab The currently active tab ("elevation" | "sun" | "profile" | "routing").
 * @property {Boolean} loading Loading indicator for API calls.
 * @property {String|null} errorMessage Current error message if an operation failed.
 */
const state = {
    description: "additional:modules.tools.voibosTools.description",
    icon: "bi-geo-alt",
    hasMouseMapInteractions: true,
    name: "additional:modules.tools.voibosTools.title",
    supportedDevices: ["Desktop", "Mobile", "Table"],
    supportedMapModes: ["2D", "3D"],
    type: "voibosTools",

    activeTab: "elevation",
    loading: false,
    errorMessage: null
};

export default state;
