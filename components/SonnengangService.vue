<script>
/**
 * SonnengangService component - Sonnenstandsanalyse.
 * @module addons/voibosTools/components/SonnengangService
 */
export default {
    name: "SonnengangService"
};
</script>

<template>
    <div id="voibos-sonnengang" class="voibos-subtool p-2">
        <h5 class="mb-3">
            <i class="bi bi-sun me-2" aria-hidden="true" />
            {{ $t("additional:modules.tools.voibosTools.sun.title") }}
        </h5>
        <p class="text-muted">
            {{ $t("additional:modules.tools.voibosTools.sun.description") }}
        </p>
        <div class="alert alert-info d-flex align-items-center" role="alert">
            <i class="bi bi-info-circle-fill me-2" aria-hidden="true" />
            <div>
                {{ $t("additional:modules.tools.voibosTools.sun.status") }}
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-subtool {
    height: 100%;
}
</style>
