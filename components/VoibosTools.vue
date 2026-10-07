<script>
import {mapGetters, mapMutations} from "vuex";
import NavTab from "@shared/modules/tabs/components/NavTab.vue";
import HoehenService from "./HoehenService.vue";
import SonnengangService from "./SonnengangService.vue";
import ProfilService from "./ProfilService.vue";
import WegzeitService from "./WegzeitService.vue";

/**
 * VoibosTools - Hauptcontainer mit Tabs für die 4 Voibos-Tools.
 * [1. Höhe | 2. Sonnengang | 3. Profil | 4. Wegzeit]
 * @module addons/voibosTools/components/VoibosTools
 */
export default {
    name: "VoibosTools",
    components: {
        NavTab,
        HoehenService,
        SonnengangService,
        ProfilService,
        WegzeitService
    },
    props: {
        /** Side of the menu (mainMenu or secondaryMenu) */
        side: {
            type: String,
            default: "secondaryMenu"
        }
    },
    data () {
        return {
            tabs: [
                {
                    id: "elevation",
                    label: "additional:modules.tools.voibosTools.tabs.elevation",
                    icon: "bi-geo-alt",
                    component: "HoehenService"
                },
                {
                    id: "sun",
                    label: "additional:modules.tools.voibosTools.tabs.sun",
                    icon: "bi-sun",
                    component: "SonnengangService"
                },
                {
                    id: "profile",
                    label: "additional:modules.tools.voibosTools.tabs.profile",
                    icon: "bi-graph-up",
                    component: "ProfilService"
                },
                {
                    id: "routing",
                    label: "additional:modules.tools.voibosTools.tabs.routing",
                    icon: "bi-stopwatch",
                    component: "WegzeitService"
                }
            ]
        };
    },
    computed: {
        ...mapGetters("Modules/VoibosTools", [
            "activeTab",
            "loading",
            "errorMessage"
        ])
    },
    methods: {
        ...mapMutations("Modules/VoibosTools", [
            "setActiveTab",
            "setLoading",
            "setErrorMessage"
        ])
    }
};
</script>

<template>
    <div id="voibos-tools" class="voibos-tools-container">
        <!-- Tab Navigation: [1. Höhe | 2. Sonnengang | 3. Profil | 4. Wegzeit] -->
        <ul
            id="voibos-tabs"
            class="nav nav-tabs nav-fill mb-3"
            role="tablist"
        >
            <NavTab
                v-for="tab in tabs"
                :id="`voibos-tab-${tab.id}`"
                :key="tab.id"
                :active="activeTab === tab.id"
                :target="`#voibos-pane-${tab.id}`"
                :label="tab.label"
                :icon="tab.icon"
                :interaction="() => setActiveTab(tab.id)"
            />
        </ul>

        <!-- Tab Panes -->
        <div id="voibos-tab-content" class="tab-content flex-grow-1">
            <div
                v-for="tab in tabs"
                :id="`voibos-pane-${tab.id}`"
                :key="tab.id"
                class="tab-pane fade"
                :class="{'show active': activeTab === tab.id}"
                role="tabpanel"
                :aria-labelledby="`voibos-tab-${tab.id}`"
                tabindex="0"
            >
                <component
                    :is="tab.component"
                    v-if="activeTab === tab.id"
                />
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-tools-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;

    .tab-content {
        overflow-y: auto;
        padding-top: 0.5rem;
    }
}
</style>
