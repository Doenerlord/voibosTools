# Voibos Tools AddOn for Masterportal

Masterportal 3.26 Vue 3 AddOn for the Austrian Voibos platform JSON services (geoland.at).

## Features
- **1. Höhe:** Punkthöhenabfrage über Adria (m ü. A.) per Klick auf die Karte
- **2. Sonnengang:** Sonnenstandsanalyse (Höhe, Azimut, Auf- und Untergang)
- **3. Profil:** Geländeschnitt entlang einer gezeichneten Profillinie
- **4. Wegzeit:** Multi-Punkt-Routen-, Wegzeit- und Distanzberechnung

## Structure
```
voibosTools/
├── index.js                     # AddOn entry point & registration
├── package.json                 # AddOn metadata
├── components/
│   ├── VoibosTools.vue          # Main shell with tab navigation
│   ├── HoehenService.vue        # Elevation subtool
│   ├── SonnengangService.vue    # Sun position subtool
│   ├── ProfilService.vue        # Elevation profile subtool
│   └── WegzeitService.vue       # Travel time subtool
├── services/
│   ├── coordinateService.js     # Coordinate transformation wrapper (EPSG:3857 -> Voibos CRS)
│   └── voibosApi.js             # HTTP client for geoland.at endpoints
├── store/
│   ├── indexVoibosTools.js      # Vuex store module
│   ├── stateVoibosTools.js      # Reactive state
│   ├── gettersVoibosTools.js    # Store getters
│   ├── mutationsVoibosTools.js  # Store mutations
│   └── actionsVoibosTools.js    # Store actions
└── locales/
    ├── de/additional.json
    └── en/additional.json
```
