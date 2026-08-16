// The scene / theme taxonomy Peruse recognises with zero-shot CLIP.
//
// Each entry pairs a short display label with a natural-language prompt the
// text encoder scores against the image embedding. Prompts are phrased as
// "a photo of ..." because CLIP was trained on caption-like text and scores
// such phrasings more reliably than bare nouns.

export interface LabelDef {
  label: string;
  group: ThemeGroup;
  prompt: string;
}

export type ThemeGroup = "Scenes" | "Objects & Transport" | "Activities & Social";

export const LABELS: LabelDef[] = [
  // Scenes
  { label: "Sunset", group: "Scenes", prompt: "a photo of a sunset or sunrise with a golden sky" },
  { label: "Silhouette", group: "Scenes", prompt: "a backlit silhouette photo against a bright sky" },
  { label: "Road", group: "Scenes", prompt: "a photo of a road or highway stretching ahead" },
  { label: "River", group: "Scenes", prompt: "a photo of a river, lake, or waterfront" },
  { label: "Mountains", group: "Scenes", prompt: "a photo of mountains or dramatic landscape" },
  { label: "Beach", group: "Scenes", prompt: "a photo of a beach with sand and ocean" },
  { label: "Night", group: "Scenes", prompt: "a photo taken at night with city lights" },
  { label: "Travel", group: "Scenes", prompt: "a travel photo of a famous landmark or tourist destination" },
  { label: "Nature", group: "Scenes", prompt: "a photo of nature, forest, or greenery" },
  { label: "Snow", group: "Scenes", prompt: "a photo of a snowy winter scene" },

  // Objects & Transport
  { label: "Cars", group: "Objects & Transport", prompt: "a photo of a car or automobile" },
  { label: "Architecture", group: "Objects & Transport", prompt: "a photo of a building or architecture" },
  { label: "Food & Dining", group: "Objects & Transport", prompt: "a photo of food on a plate at a restaurant" },
  { label: "Flowers", group: "Objects & Transport", prompt: "a close-up photo of flowers or plants" },
  { label: "Pets", group: "Objects & Transport", prompt: "a photo of a pet cat or dog" },
  { label: "Boats", group: "Objects & Transport", prompt: "a photo of a boat or ship on the water" },
  { label: "Aircraft", group: "Objects & Transport", prompt: "a photo of an airplane or aircraft" },
  { label: "Documents", group: "Objects & Transport", prompt: "a screenshot, document, receipt, or text on a screen" },

  // Activities & Social
  { label: "People", group: "Activities & Social", prompt: "a photo of one or more people, a portrait" },
  { label: "Play", group: "Activities & Social", prompt: "a photo of children playing" },
  { label: "Football", group: "Activities & Social", prompt: "a photo of people playing football or soccer" },
  { label: "Sports", group: "Activities & Social", prompt: "a photo of a sports game or athletic activity" },
  { label: "Gathering", group: "Activities & Social", prompt: "a photo of a party, celebration, or group gathering" },
  { label: "Concert", group: "Activities & Social", prompt: "a photo of a concert or live music performance" },
  { label: "Wedding", group: "Activities & Social", prompt: "a photo from a wedding ceremony" },
];

/** Score above which a zero-shot label is attached to a photo. */
export const TAG_THRESHOLD = 0.22;

/** Max labels attached per photo. */
export const MAX_TAGS = 4;
