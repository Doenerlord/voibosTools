<script>
/**
 * ProfilService component - Höhenprofil.
 * @module addons/voibosTools/components/ProfilService
 */
export default {
    name: "ProfilService"
};
</script>

<template>
    <div
        id="voibos-profilservice"
        class="voibos-subtool p-2"
    >
        <h5 class="mb-3">
            <i
                class="bi bi-graph-up me-2"
                aria-hidden="true"
            />
            {{ $t("additional:modules.tools.voibosTools.profile.title") }}
        </h5>
        <p class="text-muted">
            {{ $t("additional:modules.tools.voibosTools.profile.description") }}
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
                {{ $t("additional:modules.tools.voibosTools.profile.status") }}
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.voibos-subtool {
    height: 100%;
}
</style>
