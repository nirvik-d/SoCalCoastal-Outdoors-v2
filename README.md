# SoCal Coastal Outdoors

A web application that displays outdoor places (parks and recreation) within Southern California coastal cities using ArcGIS Maps SDK for JavaScript.

## Features

* **City Selection:** Dropdown menu to select coastal cities
* **Map Visualization:** Interactive map showing selected city boundaries
* **Outdoor Places:** Displays parks and recreation within the selected city
* **Place Details:** Click markers to view place name

## Screenshot

1. The main application
   <img width="1919" height="955" alt="image" src="https://github.com/user-attachments/assets/ba8db19a-9327-4935-a28c-797fb6823188" />
   
## Prerequisites

* Node.js
* Vite
* ArcGIS API Key (stored in environment variables)

## Project Setup

1. **Initialize Project**

    ```bash
    npm create vite@latest
    ```

    Follow the instructions on screen to initialize the project.

2. **Install Dependencies**

    ```bash
    npm install
    ```

3. **Set Environment Variables**

    Create a `.env.local` file in the project root with:
    ```
    VITE_ARCGIS_API_KEY=your_arcgis_api_key_here
    ```

4. **Install the required ArcGIS and Calcite dependencies**

   ```bash
   npm install @arcgis/map-components
   ```

## Code Structure

### HTML Structure

The HTML file sets up the ArcGIS web application with a map and city selector:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SoCal Coastal Outdoors</title>
  </head>
  <body>
    <arcgis-map
      basemap="arcgis/topographic"
      center="-117.9988, 33.6595"
      zoom="8"
    >
      <arcgis-zoom position="top-left"></arcgis-zoom>
      <arcgis-expand position="top-left">
        <arcgis-basemap-gallery></arcgis-basemap-gallery>
      </arcgis-expand>
      <arcgis-placement position="top-right">
        <calcite-select id="citySelector"></calcite-select>
      </arcgis-placement>
    </arcgis-map>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```
### CSS-Style
```css
/* Include calcite, core API and SDK component CSS */
@import "https://js.arcgis.com/calcite-components/3.2.1/calcite.css";
@import "https://js.arcgis.com/4.33/@arcgis/core/assets/esri/themes/light/main.css";
@import "https://js.arcgis.com/4.33/map-components/main.css";

html,
body {
  height: 100%;
  margin: 0;
}

#citySelector {
  border-radius: 5px;
}
```

### TypeScript code

1. **Import the required modules**

```typescript
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
```

2. **Authenicate using the API key**

```typescript
// API authentication
esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY;
```

3. **Create the feature layers and load them along with the project operator**

```typescript
const beachAccessPoints: FeatureLayer = new FeatureLayer({
  url: "https://services9.arcgis.com/wwVnNW92ZHUIr0V0/arcgis/rest/services/AccessPoints/FeatureServer/0/",
  outFields: ["*"],
  definitionExpression: `COUNTY IN ('Santa Barbara', 'Ventura', 'Los Angeles', 'Orange', 'San Diego', 'San Luis Obispo', 'Imperial')`,
});

const coastalCitiesLayer: FeatureLayer = new FeatureLayer({
  url: "https://services3.arcgis.com/uknczv4rpevve42E/arcgis/rest/services/California_Cities_and_Identifiers_Blue_Version_view/FeatureServer/2/",
  outFields: ["*"],
  definitionExpression: `CDTFA_COUNTY IN ('Santa Barbara County', 'Ventura County', 'Los Angeles County', 'Orange County', 'San Diego County', 'San Luis Obispo County', 'Imperial County')`
});
```

4. **Query the beach access features**

```typescript
// Query features
const [beachAccessResult]: [FeatureSet] = await Promise.all([
  beachAccessPoints.queryFeatures(),
]);
```

5. **Get the geometries of the beach access features**

```typescript
const beachAccessGeometries: GeometryUnion[] = beachAccessResult.features.map((feature: Graphic) => feature.geometry!);
```

6. **Chunk the geometries and union the chunks to improve performance**

```typescript
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
```

7. **Find the coastal cities that intersect with the unioned geometry**

```typescript
// Find coastal cities
const coastalCities: Set<Graphic> = new Set<Graphic>();
const coastalCitiesResult: FeatureSet = await coastalCitiesLayer.queryFeatures({
  geometry: unionedGeometry!,
  spatialRelationship: "intersects",
  returnGeometry: true,
  outFields: ["*"],
});
```

8. **Add the coastal cities to the set**

```typescript
// Find coastal cities
coastalCitiesResult.features.forEach((feature: Graphic) => {
    coastalCities.add(feature);
});
```

9. **Create the graphics to display the city boundaries and add the graphics layer to the map**

```typescript
const coastalCitiesGraphicsLayer: GraphicsLayer = new GraphicsLayer();

// Add place graphics to the graphics layer
const coastalCitiesGraphics: Graphic[] = await Promise.all(createPlaceGraphics(coastalCities));
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
```

10. **Add the graphics layer to the map**

```typescript
// Get the map element
const arcgisMap: HTMLArcgisMapElement | null = document.querySelector("arcgis-map");
if (!arcgisMap) {
  throw new Error("Map element not found");
}

// Wait for the view to be ready
await arcgisMap.viewOnReady();

// Add the graphics layer to the map
arcgisMap.map?.add(coastalCitiesGraphicsLayer);
```

11. **Get the calcite select element and create a default option**

```typescript
const citySelector: HTMLCalciteSelectElement | null = document.querySelector("#citySelector");
if (!citySelector) {
  throw new Error("City selector not found");
}

// Add default option to the select
const defaultOption: HTMLCalciteOptionElement = document.createElement("calcite-option");
defaultOption.value = "";
defaultOption.disabled = true;
defaultOption.selected = true;
defaultOption.innerHTML = "Select a City";
citySelector.appendChild(defaultOption);
```

12. **Store city features in a map for quick lookup**

```typescript
const cityFeaturesMap: Map<string, Graphic> = new Map<string, Graphic>();
```

13. **Create new calcite options for the coastal cities and store them in the hash map**

```typescript
for (const city of coastalCities) {
  const cityName: string = city.attributes.CDTFA_CITY;
  const option: HTMLCalciteOptionElement = document.createElement("calcite-option");
  option.value = cityName;
  option.innerHTML = cityName;
  citySelector.appendChild(option);
  cityFeaturesMap.set(cityName, city);
}
```

13. **Create a places layer and add it to the map**

```typescript
const placesLayer: GraphicsLayer = new GraphicsLayer({ id: "placesLayer" });
```

14. **Add event listener to the calcite select and query the place details**

```typescript
citySelector.addEventListener("calciteSelectChange", async (event: Event) => {
  const selectedCityName: string = (event.target as HTMLCalciteSelectElement).value;
  if (selectedCityName) {
    const selectedCityFeature: Graphic | undefined = cityFeaturesMap.get(selectedCityName);
    if (selectedCityFeature) {
      const geometry: GeometryUnion | nullish = selectedCityFeature.geometry;
      if (geometry && geometry!.extent!.width! < 20001 && geometry!.extent!.height! < 20001) {
        placesLayer.removeAll();
        arcgisMap.map?.remove(placesLayer);

        // Query outdoor places within the city
        const placesQueryParameters: PlacesQueryParameters = new PlacesQueryParameters({
          categoryIds: ["4d4b7105d754a06377d81259"], // Parks category
          extent: geometry!.extent,
          icon: "png",
        });

        try {
          const results: PlacesQueryResult = await places.queryPlacesWithinExtent(
            placesQueryParameters
          );

          // Add outdoor places to the map
          results.results.map(async (placeResult: PlaceResult) => {

            // Fetch place details
            const fetchPlaceResultParams = new FetchPlaceParameters({
              placeId: placeResult.placeId,
              requestedFields: ["all"],
            });
            const fetchPlaceResult: any = await places.fetchPlace(fetchPlaceResultParams);

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
            console.error(
              "Error loading outdoor places:",
              error.message[0]
            );
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
```

### Run the application
```bash
npm run dev
```

- Follow the instructions on screen to run the application.

### Build the application
```bash
npm run build
```

### Known Issues
- The application only loads outdoor places for cities with height and width of 20001 meters each.


