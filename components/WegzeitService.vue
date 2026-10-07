<script>
/**
 * WegzeitService component - Multi-Punkt-Wegzeitberechnung.
 * @module addons/voibosTools/components/WegzeitService
 */
export default {
    name: "WegzeitService"
};
</script>

<template>
    <div
        id="voibos-wegzeitservice"
        class="voibos-subtool p-2"
    >
        <h5 class="mb-3">
            <i
                class="bi bi-stopwatch me-2"
                aria-hidden="true"
            />
            {{ $t("additional:modules.tools.voibosTools.routing.title") }}
        </h5>
        <p class="text-muted">
            {{ $t("additional:modules.tools.voibosTools.routing.description") }}
        </p>
        <div
            class="alert alert-info d-flex align-items-center"
            role="alert"
        >
            <i
                class="bi bi-info-circle-fill me-2"
                aria-hidden="true"
            />
            <div>
                {{ $t("additional:modules.tools.voibosTools.routing.status") }}
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-subtool {
    height: 100%;
}
</style>
