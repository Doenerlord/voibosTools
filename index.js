import VoibosToolsComponent from "./components/VoibosTools.vue";
import VoibosToolsStore from "./store/indexVoibosTools.js";
import deLocale from "./locales/de/additional.json";
import enLocale from "./locales/en/additional.json";

/**
 * VoibosTools Addon entry point.
 */
export default {
    component: VoibosToolsComponent,
    store: VoibosToolsStore,
    locales: {
        de: deLocale,
        en: enLocale
    }
};
