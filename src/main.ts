import "./style.css";

import "@esri/calcite-components/components/calcite-select";
import "@esri/calcite-components/components/calcite-option";
import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-zoom";
import "@arcgis/map-components/components/arcgis-expand";
import "@arcgis/map-components/components/arcgis-basemap-gallery";
import "@arcgis/map-components/components/arcgis-placement";
import "@arcgis/map-components/components/arcgis-feature-table";

import esriConfig from "@arcgis/core/config";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import FeatureSet from "@arcgis/core/rest/support/FeatureSet";
import Graphic from "@arcgis/core/Graphic";
import * as places from "@arcgis/core/rest/places";
import PlacesQueryParameters from "@arcgis/core/rest/support/PlacesQueryParameters";
import PlacesQueryResult from "@arcgis/core/rest/support/PlacesQueryResult";
import FetchPlaceParameters from "@arcgis/core/rest/support/FetchPlaceParameters";
import PlaceResult from "@arcgis/core/rest/support/PlaceResult";
import * as unionOperator from "@arcgis/core/geometry/operators/unionOperator";
import type { GeometryUnion } from "@arcgis/core/unionTypes";

// API authentication
esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY;

// Create feature layers
const beachAccessPoints: FeatureLayer = new FeatureLayer({
  url: "https://services9.arcgis.com/wwVnNW92ZHUIr0V0/arcgis/rest/services/AccessPoints/FeatureServer/0/",
  outFields: ["*"],
  definitionExpression: `COUNTY IN ('Santa Barbara', 'Ventura', 'Los Angeles', 'Orange', 'San Diego', 'San Luis Obispo', 'Imperial')`,
});

const coastalCitiesLayer: FeatureLayer = new FeatureLayer({
  url: "https://services3.arcgis.com/uknczv4rpevve42E/arcgis/rest/services/California_Cities_and_Identifiers_Blue_Version_view/FeatureServer/2/",
  outFields: ["*"],
  definitionExpression: `CDTFA_COUNTY IN ('Santa Barbara County', 'Ventura County', 'Los Angeles County', 'Orange County', 'San Diego County', 'San Luis Obispo County', 'Imperial County')`,
});

// Query features
const [beachAccessResult]: [FeatureSet] = await Promise.all([
  beachAccessPoints.queryFeatures(),
]);

// Prepare the geometries for the beach access points
const beachAccessGeometries: GeometryUnion[] = await Promise.all(
  beachAccessResult.features.map((feature: Graphic) => feature.geometry!)
);

// Chunk the geometries
const chunkSize = Math.ceil(beachAccessGeometries.length / 8);

// Union the geometries
const unionedBeachAccessGeometry: GeometryUnion | nullish =
  await runUnion(beachAccessGeometries, chunkSize);

// Helper function to union geometries in a worker
async function runUnion(
  beachAccessGeometries: GeometryUnion[],
  chunkSize: number
): Promise<GeometryUnion | nullish> {

  let unionedGeometry: GeometryUnion | nullish = beachAccessGeometries[0];

  for (let i = 1; i < beachAccessGeometries!.length; i += chunkSize) {
    const chunk = beachAccessGeometries!.slice(i, i + chunkSize);
    unionedGeometry = unionOperator.executeMany([unionedGeometry!, ...chunk]);
  }

  return unionedGeometry;
}

// Find the coastal cities that are connected to the beach access
const coastalCities: Set<Graphic> = new Set<Graphic>();
const coastalCitiesResult: FeatureSet = await coastalCitiesLayer.queryFeatures({
  geometry: unionedBeachAccessGeometry!,
  spatialRelationship: "intersects",
  returnGeometry: true,
  outFields: ["*"],
});

coastalCitiesResult.features.forEach((feature: Graphic) => {
  coastalCities.add(feature);
});

// Create a graphics layer
const coastalCitiesGraphicsLayer: GraphicsLayer = new GraphicsLayer();

// Add place graphics to the graphics layer
const coastalCitiesGraphics: Graphic[] = await Promise.all(
  createPlaceGraphics(coastalCities)
);
coastalCitiesGraphicsLayer.addMany(coastalCitiesGraphics);

function createPlaceGraphics(placeFeatures: Set<Graphic>) {
  return Array.from(placeFeatures).map((placeFeature: Graphic) => {
    return new Graphic({
      geometry: placeFeature.geometry!,
      attributes: placeFeature.attributes,
      symbol: {
        type: "simple-fill",
        color: [0, 120, 255, 0.5],
        outline: {
          color: [0, 0, 0, 0.6],
          width: 1,
        },
      },
      popupTemplate: {
        title: "City",
        content: [
          {
            type: "fields",
            fieldInfos: [
              {
                fieldName: "CDTFA_CITY",
                label: "City",
              },
            ],
          },
        ],
      },
    });
  });
}

// Get the map element
const arcgisMap: HTMLArcgisMapElement | null =
  document.querySelector("arcgis-map");
if (!arcgisMap) {
  throw new Error("Map element not found");
}

// Wait for the view to be ready
await arcgisMap.viewOnReady();

// Add the graphics layer to the map
arcgisMap.map?.add(coastalCitiesGraphicsLayer);

// Create city options
const citySelector: HTMLCalciteSelectElement | null =
  document.querySelector("#citySelector");
if (!citySelector) {
  throw new Error("City selector not found");
}

// Add default option to the select
const defaultOption: HTMLCalciteOptionElement =
  document.createElement("calcite-option");
defaultOption.value = "";
defaultOption.disabled = true;
defaultOption.selected = true;
defaultOption.innerHTML = "Select a City";
citySelector.appendChild(defaultOption);

// Store city features in a map for quick lookup
const cityFeaturesMap: Map<string, Graphic> = new Map<string, Graphic>();

// Add city options to the select and store features
for (const city of coastalCities) {
  const cityName: string = city.attributes.CDTFA_CITY;
  const option: HTMLCalciteOptionElement =
    document.createElement("calcite-option");
  option.value = cityName;
  option.innerHTML = cityName;
  citySelector.appendChild(option);
  cityFeaturesMap.set(cityName, city);
}

// Create layers for places and buffer
const placesLayer: GraphicsLayer = new GraphicsLayer({ id: "placesLayer" });

// Add event listener to the select
citySelector.addEventListener("calciteSelectChange", async (event: Event) => {
  const selectedCityName: string = (event.target as HTMLCalciteSelectElement)
    .value;
  if (selectedCityName) {
    const selectedCityFeature: Graphic | undefined =
      cityFeaturesMap.get(selectedCityName);
    if (selectedCityFeature) {
      const geometry: GeometryUnion | nullish = selectedCityFeature.geometry;
      if (
        geometry &&
        geometry!.extent!.width! < 20001 &&
        geometry!.extent!.height! < 20001
      ) {
        placesLayer.removeAll();
        arcgisMap.map?.remove(placesLayer);

        // Query outdoor places within the city
        const placesQueryParameters: PlacesQueryParameters =
          new PlacesQueryParameters({
            categoryIds: ["4d4b7105d754a06377d81259"], // Parks category
            extent: geometry!.extent,
            icon: "png",
          });

        try {
          const results: PlacesQueryResult =
            await places.queryPlacesWithinExtent(placesQueryParameters);

          // Add outdoor places to the map
          results.results.map(async (placeResult: PlaceResult) => {
            // Fetch place details
            const fetchPlaceResultParams = new FetchPlaceParameters({
              placeId: placeResult.placeId,
              requestedFields: ["all"],
            });
            const fetchPlaceResult: any = await places.fetchPlace(
              fetchPlaceResultParams
            );

            // Create place graphic
            const placeGraphic: Graphic = new Graphic({
              geometry: placeResult.location,
              symbol: {
                type: "picture-marker",
                url: placeResult.icon.url,
                width: 15,
                height: 15,
              },
              attributes: {
                name: fetchPlaceResult.placeDetails.name,
                address: fetchPlaceResult.placeDetails.address.streetAddress,
                category: placeResult.categories[0].label,
              },
              popupTemplate: {
                title: "{name}",
                content: [
                  {
                    type: "fields",
                    fieldInfos: [
                      {
                        fieldName: "address",
                        label: "Address",
                      },
                      {
                        fieldName: "category",
                        label: "Category",
                      },
                    ],
                  },
                ],
              },
            });

            placesLayer.add(placeGraphic);
          });

          // Zoom to the city with a buffer
          arcgisMap.view.goTo({
            target: geometry,
            zoom: 12,
          });

          // Add the graphics layer to the map
          arcgisMap.map?.add(placesLayer);
        } catch (error: Error | unknown) {
          if (
            error instanceof Error &&
            Array.isArray(error.message) &&
            error.message.length > 0
          ) {
            console.error("Error loading outdoor places:", error.message[0]);
          } else {
            console.error(
              "Error loading outdoor places:",
              error instanceof Error ? error.message : "Unknown error"
            );
          }
        }
      } else {
        console.warn("City is too large for place query.");
      }
    }
  }
});
