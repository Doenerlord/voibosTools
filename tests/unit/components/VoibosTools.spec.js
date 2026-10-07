import {createStore} from "vuex";
import {expect} from "chai";
import {shallowMount} from "@vue/test-utils";
import VoibosToolsComponent from "../../../components/VoibosTools.vue";
import VoibosToolsStore from "../../../store/indexVoibosTools.js";

describe("addons/voibosTools/components/VoibosTools.vue", () => {
    let store;

    beforeEach(() => {
        store = createStore({
            modules: {
                Modules: {
                    namespaced: true,
                    modules: {
                        VoibosTools: {
                            ...VoibosToolsStore
                        }
                    }
                }
            }
        });
    });

    it("renders the container with tabs", () => {
        const wrapper = shallowMount(VoibosToolsComponent, {
            global: {
                plugins: [store],
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(wrapper.find("#voibos-tools").exists()).to.be.true;
        expect(wrapper.find("#voibos-tabs").exists()).to.be.true;
        expect(wrapper.vm.tabs).to.have.lengthOf(4);
    });

    it("has 4 tabs: elevation, sun, profile, routing", () => {
        const wrapper = shallowMount(VoibosToolsComponent, {
            global: {
                plugins: [store],
                mocks: {
                    $t: key => key
                }
            }
        });

        const tabIds = wrapper.vm.tabs.map(t => t.id);

        expect(tabIds).to.deep.equal(["elevation", "sun", "profile", "routing"]);
    });

    it("switches active tab when setActiveTab mutation is called", async () => {
        const wrapper = shallowMount(VoibosToolsComponent, {
            global: {
                plugins: [store],
                mocks: {
                    $t: key => key
                }
            }
        });

        expect(wrapper.vm.activeTab).to.equal("elevation");

        wrapper.vm.setActiveTab("sun");
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.activeTab).to.equal("sun");
    });
});
