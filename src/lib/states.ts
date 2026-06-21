// ============================================================================
// U.S. state geography metadata (client-safe, static).
//
// Used to (a) anchor map markers at state capitals, (b) resolve Census FIPS
// codes, and (c) map between state names / abbreviations across the live data
// sources (Mapbox region codes, Congress.gov, OpenStates, Census).
// ============================================================================

export interface StateInfo {
  abbr: string;
  name: string;
  fips: string;
  capital: string;
  lat: number;
  lng: number;
}

export const STATES: Record<string, StateInfo> = {
  AL: { abbr: "AL", name: "Alabama", fips: "01", capital: "Montgomery", lat: 32.377, lng: -86.3006 },
  AK: { abbr: "AK", name: "Alaska", fips: "02", capital: "Juneau", lat: 58.3019, lng: -134.4197 },
  AZ: { abbr: "AZ", name: "Arizona", fips: "04", capital: "Phoenix", lat: 33.4484, lng: -112.074 },
  AR: { abbr: "AR", name: "Arkansas", fips: "05", capital: "Little Rock", lat: 34.7465, lng: -92.2896 },
  CA: { abbr: "CA", name: "California", fips: "06", capital: "Sacramento", lat: 38.5816, lng: -121.4944 },
  CO: { abbr: "CO", name: "Colorado", fips: "08", capital: "Denver", lat: 39.7392, lng: -104.9903 },
  CT: { abbr: "CT", name: "Connecticut", fips: "09", capital: "Hartford", lat: 41.7637, lng: -72.6851 },
  DE: { abbr: "DE", name: "Delaware", fips: "10", capital: "Dover", lat: 39.1582, lng: -75.5244 },
  DC: { abbr: "DC", name: "District of Columbia", fips: "11", capital: "Washington", lat: 38.9072, lng: -77.0369 },
  FL: { abbr: "FL", name: "Florida", fips: "12", capital: "Tallahassee", lat: 30.4383, lng: -84.2807 },
  GA: { abbr: "GA", name: "Georgia", fips: "13", capital: "Atlanta", lat: 33.749, lng: -84.388 },
  HI: { abbr: "HI", name: "Hawaii", fips: "15", capital: "Honolulu", lat: 21.3069, lng: -157.8583 },
  ID: { abbr: "ID", name: "Idaho", fips: "16", capital: "Boise", lat: 43.615, lng: -116.2023 },
  IL: { abbr: "IL", name: "Illinois", fips: "17", capital: "Springfield", lat: 39.7817, lng: -89.6501 },
  IN: { abbr: "IN", name: "Indiana", fips: "18", capital: "Indianapolis", lat: 39.7684, lng: -86.1581 },
  IA: { abbr: "IA", name: "Iowa", fips: "19", capital: "Des Moines", lat: 41.5868, lng: -93.625 },
  KS: { abbr: "KS", name: "Kansas", fips: "20", capital: "Topeka", lat: 39.0473, lng: -95.6752 },
  KY: { abbr: "KY", name: "Kentucky", fips: "21", capital: "Frankfort", lat: 38.2009, lng: -84.8733 },
  LA: { abbr: "LA", name: "Louisiana", fips: "22", capital: "Baton Rouge", lat: 30.4515, lng: -91.1871 },
  ME: { abbr: "ME", name: "Maine", fips: "23", capital: "Augusta", lat: 44.3106, lng: -69.7795 },
  MD: { abbr: "MD", name: "Maryland", fips: "24", capital: "Annapolis", lat: 38.9784, lng: -76.4922 },
  MA: { abbr: "MA", name: "Massachusetts", fips: "25", capital: "Boston", lat: 42.3601, lng: -71.0589 },
  MI: { abbr: "MI", name: "Michigan", fips: "26", capital: "Lansing", lat: 42.7325, lng: -84.5555 },
  MN: { abbr: "MN", name: "Minnesota", fips: "27", capital: "Saint Paul", lat: 44.9537, lng: -93.09 },
  MS: { abbr: "MS", name: "Mississippi", fips: "28", capital: "Jackson", lat: 32.2988, lng: -90.1848 },
  MO: { abbr: "MO", name: "Missouri", fips: "29", capital: "Jefferson City", lat: 38.5767, lng: -92.1735 },
  MT: { abbr: "MT", name: "Montana", fips: "30", capital: "Helena", lat: 46.5891, lng: -112.0391 },
  NE: { abbr: "NE", name: "Nebraska", fips: "31", capital: "Lincoln", lat: 40.8136, lng: -96.7026 },
  NV: { abbr: "NV", name: "Nevada", fips: "32", capital: "Carson City", lat: 39.1638, lng: -119.7674 },
  NH: { abbr: "NH", name: "New Hampshire", fips: "33", capital: "Concord", lat: 43.2081, lng: -71.5376 },
  NJ: { abbr: "NJ", name: "New Jersey", fips: "34", capital: "Trenton", lat: 40.2206, lng: -74.7597 },
  NM: { abbr: "NM", name: "New Mexico", fips: "35", capital: "Santa Fe", lat: 35.687, lng: -105.9378 },
  NY: { abbr: "NY", name: "New York", fips: "36", capital: "Albany", lat: 42.6526, lng: -73.7562 },
  NC: { abbr: "NC", name: "North Carolina", fips: "37", capital: "Raleigh", lat: 35.7796, lng: -78.6382 },
  ND: { abbr: "ND", name: "North Dakota", fips: "38", capital: "Bismarck", lat: 46.8083, lng: -100.7837 },
  OH: { abbr: "OH", name: "Ohio", fips: "39", capital: "Columbus", lat: 39.9612, lng: -82.9988 },
  OK: { abbr: "OK", name: "Oklahoma", fips: "40", capital: "Oklahoma City", lat: 35.4676, lng: -97.5164 },
  OR: { abbr: "OR", name: "Oregon", fips: "41", capital: "Salem", lat: 44.9429, lng: -123.0351 },
  PA: { abbr: "PA", name: "Pennsylvania", fips: "42", capital: "Harrisburg", lat: 40.2732, lng: -76.8867 },
  RI: { abbr: "RI", name: "Rhode Island", fips: "44", capital: "Providence", lat: 41.824, lng: -71.4128 },
  SC: { abbr: "SC", name: "South Carolina", fips: "45", capital: "Columbia", lat: 34.0007, lng: -81.0348 },
  SD: { abbr: "SD", name: "South Dakota", fips: "46", capital: "Pierre", lat: 44.3683, lng: -100.351 },
  TN: { abbr: "TN", name: "Tennessee", fips: "47", capital: "Nashville", lat: 36.1627, lng: -86.7816 },
  TX: { abbr: "TX", name: "Texas", fips: "48", capital: "Austin", lat: 30.2672, lng: -97.7431 },
  UT: { abbr: "UT", name: "Utah", fips: "49", capital: "Salt Lake City", lat: 40.7608, lng: -111.891 },
  VT: { abbr: "VT", name: "Vermont", fips: "50", capital: "Montpelier", lat: 44.2601, lng: -72.5754 },
  VA: { abbr: "VA", name: "Virginia", fips: "51", capital: "Richmond", lat: 37.5407, lng: -77.436 },
  WA: { abbr: "WA", name: "Washington", fips: "53", capital: "Olympia", lat: 47.0379, lng: -122.9007 },
  WV: { abbr: "WV", name: "West Virginia", fips: "54", capital: "Charleston", lat: 38.3498, lng: -81.6326 },
  WI: { abbr: "WI", name: "Wisconsin", fips: "55", capital: "Madison", lat: 43.0731, lng: -89.4012 },
  WY: { abbr: "WY", name: "Wyoming", fips: "56", capital: "Cheyenne", lat: 41.14, lng: -104.8202 },
};

export const DC_HUB = STATES.DC;

const BY_NAME: Record<string, string> = Object.fromEntries(
  Object.values(STATES).map((s) => [s.name.toLowerCase(), s.abbr]),
);
const BY_FIPS: Record<string, string> = Object.fromEntries(
  Object.values(STATES).map((s) => [s.fips, s.abbr]),
);

export function stateByAbbr(abbr?: string | null): StateInfo | undefined {
  if (!abbr) return undefined;
  return STATES[abbr.toUpperCase()];
}

export function stateByName(name?: string | null): StateInfo | undefined {
  if (!name) return undefined;
  const abbr = BY_NAME[name.trim().toLowerCase()];
  return abbr ? STATES[abbr] : undefined;
}

export function stateByFips(fips?: string | null): StateInfo | undefined {
  if (!fips) return undefined;
  const abbr = BY_FIPS[fips.padStart(2, "0")];
  return abbr ? STATES[abbr] : undefined;
}
