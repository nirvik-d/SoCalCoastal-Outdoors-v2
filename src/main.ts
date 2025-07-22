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
import Graphic from "@arcgis/core/Graphic";
import * as places from "@arcgis/core/rest/places";
import PlacesQueryParameters from "@arcgis/core/rest/support/PlacesQueryParameters";

// API authentication
esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY;

// Get the map view
const viewElement = document.querySelector("arcgis-map");
viewElement?.addEventListener("arcgisViewReadyChange", async () => {
  // Create a graphics layer
  const coastalCitiesGraphicsLayer = new GraphicsLayer();

  // Create feature layers
  const beachAccessPoints = new FeatureLayer({
    url: "https://services9.arcgis.com/wwVnNW92ZHUIr0V0/arcgis/rest/services/AccessPoints/FeatureServer/0/",
    outFields: ["*"],
    definitionExpression: `COUNTY IN ('Santa Barbara', 'Ventura', 'Los Angeles', 'Orange', 'San Diego', 'San Luis Obispo', 'Imperial')`,
  });

  const coastalBufferLayer = new FeatureLayer({
    url: "https://services3.arcgis.com/uknczv4rpevve42E/arcgis/rest/services/California_County_Boundaries_and_Identifiers_with_Coastal_Buffers/FeatureServer/1",
    definitionExpression:
      "OFFSHORE IS NOT NULL AND CDTFA_COUNTY in ('Santa Barbara County', 'Ventura County', 'Los Angeles County', 'Orange County', 'San Diego County', 'San Luis Obispo County', 'Imperial County')",
    outFields: ["*"],
  });

  const coastalCitiesLayer = new FeatureLayer({
    url: "https://services3.arcgis.com/uknczv4rpevve42E/arcgis/rest/services/California_Cities_and_Identifiers_Blue_Version_view/FeatureServer/2/",
    outFields: ["*"],
  });

  // Load feature layers
  beachAccessPoints.load();
  coastalBufferLayer.load();
  coastalCitiesLayer.load();

  // Query features
  const [coastalBufferResult, beachAccessResult] = await Promise.all([
    coastalBufferLayer.queryFeatures(),
    beachAccessPoints.queryFeatures(),
  ]);

  const coastalCitiesResult = [];

  // Query coastal cities
  for (const feature of coastalBufferResult.features) {
    coastalCitiesResult.push(
      coastalCitiesLayer.queryFeatures({
        geometry: feature.geometry,
        spatialRelationship: "intersects",
        returnGeometry: true,
        outFields: ["*"],
      })
    );
  }

  // Query beach access points
  for (const feature of beachAccessResult.features) {
    coastalCitiesResult.push(
      coastalCitiesLayer.queryFeatures({
        geometry: feature.geometry,
        spatialRelationship: "intersects",
        returnGeometry: true,
        outFields: ["*"],
      })
    );
  }

  // Get results
  const results = await Promise.all(coastalCitiesResult);
  const allCityFeatures = results.flatMap((r) => r.features);

  // Filter city features
  const alreadyExists = new Set<any>();
  const filteredCityFeatures = allCityFeatures.filter((feature: any) => {
    const cityName = feature.attributes.CDTFA_CITY;

    if (alreadyExists.has(cityName)) {
      return false;
    } else {
      alreadyExists.add(cityName);
      return true;
    }
  });

  // Create place graphics
  function createPlaceGraphics(placeFeatures: any) {
    return placeFeatures.map((placeFeature: any) => {
      return new Graphic({
        geometry: placeFeature.geometry,
        attributes: placeFeature.attributes,
        symbol: {
          type: "simple-fill",
          color: [0, 120, 255, 0.5],
          outline: {
            color: [0, 0, 0, 0.6],
            width: 1,
          },
        },
      });
    });
  }

  // Add place graphics to the graphics layer
  const coastalCitiesGraphics = createPlaceGraphics(filteredCityFeatures);
  coastalCitiesGraphicsLayer.addMany(coastalCitiesGraphics);

  // Add the graphics layer to the map
  viewElement?.map?.add(coastalCitiesGraphicsLayer);

  // Create city options
  const citySelector = document.getElementById("citySelector") as any;

  // Add default option to the select
  const defaultOption = document.createElement("calcite-option");
  defaultOption.value = "";
  defaultOption.disabled = true;
  defaultOption.selected = true;
  defaultOption.innerHTML = "Select a City";
  citySelector.appendChild(defaultOption);

  // Store city features in a map for quick lookup
  const cityFeaturesMap = new Map<string, any>();

  // Add city options to the select and store features
  for (const city of filteredCityFeatures) {
    const cityName = city.attributes.CDTFA_CITY;
    const option = document.createElement("calcite-option");
    option.value = cityName;
    option.innerHTML = cityName;
    citySelector.appendChild(option);
    cityFeaturesMap.set(cityName, city);
  }

  // Create layers for places and buffer
  const placesLayer = new GraphicsLayer({ id: "placesLayer" });

  // Add event listener to the select
  citySelector.addEventListener("calciteSelectChange", async (event: any) => {
    const selectedCityName = event.target.value;
    if (selectedCityName) {
      const selectedCityFeature = cityFeaturesMap.get(selectedCityName);
      if (selectedCityFeature) {
        const geometry = selectedCityFeature.geometry;
        if (geometry.extent.width < 20001 && geometry.extent.height < 20001) {
          placesLayer.removeAll();
          viewElement?.map?.remove(placesLayer);

          // Query outdoor places within the city
          const placesQueryParameters = new PlacesQueryParameters({
            categoryIds: ["4d4b7105d754a06377d81259"], // Parks category
            extent: geometry.extent,
            icon: "png",
          });

          try {
            const results = await places.queryPlacesWithinExtent(
              placesQueryParameters
            );

            // Add outdoor places to the map
            results.results.forEach((placeResult: any) => {
              const placeGraphic = new Graphic({
                geometry: placeResult.location,
                symbol: {
                  type: "picture-marker",
                  url: placeResult.icon.url,
                  width: 15,
                  height: 15,
                },
                attributes: {
                  name: placeResult.name,
                  address: placeResult.address,
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
            viewElement?.goTo({
              target: geometry,
              zoom: 12,
            });

            // Add the graphics layer to the map
            viewElement?.map?.add(placesLayer);
          } catch (error: any) {
            if (
              error.details &&
              Array.isArray(error.details.messages) &&
              error.details.messages.length > 0
            ) {
              console.error(
                "Error loading outdoor places:",
                error.details.messages[0]
              );
            } else {
              console.error(
                "Error loading outdoor places:",
                error.message || error.toString()
              );
            }
          }
        } else {
          console.warn("City is too large for place query.");
        }
      }
    }
  });
});
