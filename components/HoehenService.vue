<script>
/**
 * HoehenService component - Punkthöhenabfrage.
 * @module addons/voibosTools/components/HoehenService
 */
export default {
    name: "HoehenService"
};
</script>

<template>
    <div id="voibos-hoehenservice" class="voibos-subtool p-2">
        <h5 class="mb-3">
            <i class="bi bi-geo-alt me-2" aria-hidden="true" />
            {{ $t("additional:modules.tools.voibosTools.elevation.title") }}
        </h5>
        <p class="text-muted">
            {{ $t("additional:modules.tools.voibosTools.elevation.description") }}
        </p>
        <div class="alert alert-info d-flex align-items-center" role="alert">
            <i class="bi bi-info-circle-fill me-2" aria-hidden="true" />
            <div>
                {{ $t("additional:modules.tools.voibosTools.elevation.status") }}
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-subtool {
    height: 100%;
}
</style>
