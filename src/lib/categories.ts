// Default categories created for every new user, plus the keywords the
// rule-based parser uses to recognise them.

export interface DefaultCategory {
  key: string;
  name: string;
  icon: string;
  color: string;
  keywords: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    key: "food",
    name: "Food",
    icon: "utensils",
    color: "#4F46E5",
    keywords: ["food", "lunch", "dinner", "breakfast", "brunch", "snack", "snacks", "swiggy", "zomato", "restaurant", "cafe", "coffee", "chai", "tea", "pizza", "burger", "biryani", "dosa", "idli", "meal", "dominos", "kfc", "mcdonalds", "starbucks", "juice", "bakery", "sweets", "eat", "canteen"],
  },
  {
    key: "groceries",
    name: "Groceries",
    icon: "shopping-cart",
    color: "#10B981",
    keywords: ["grocery", "groceries", "bigbasket", "blinkit", "zepto", "dmart", "instamart", "vegetables", "veggies", "milk", "fruits", "supermarket", "kirana", "eggs", "bread", "rice", "atta"],
  },
  {
    key: "fuel",
    name: "Fuel",
    icon: "fuel",
    color: "#0EA5E9",
    keywords: ["petrol", "diesel", "fuel", "cng", "shell", "hp", "iocl", "bpcl", "indian oil", "bharat petroleum", "hindustan petroleum", "nayara", "ev charging"],
  },
  {
    key: "transport",
    name: "Transport",
    icon: "car",
    color: "#64748B",
    keywords: ["uber", "ola", "rapido", "auto", "cab", "taxi", "metro", "bus", "train", "parking", "toll", "fastag", "bike service", "car service"],
  },
  {
    key: "shopping",
    name: "Shopping",
    icon: "shopping-bag",
    color: "#EC4899",
    keywords: ["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "clothes", "shirt", "shoes", "shopping", "dress", "jeans", "electronics", "gadget", "decathlon"],
  },
  {
    key: "bills",
    name: "Bills",
    icon: "receipt",
    color: "#F59E0B",
    keywords: ["electricity", "bill", "bills", "recharge", "wifi", "internet", "broadband", "water bill", "gas bill", "lpg", "cylinder", "mobile bill", "postpaid", "prepaid", "dth", "jio", "airtel", "vi", "bsnl", "insurance", "emi"],
  },
  {
    key: "rent",
    name: "Rent",
    icon: "home",
    color: "#8B5CF6",
    keywords: ["rent", "maintenance", "society", "pg", "hostel", "deposit"],
  },
  {
    key: "health",
    name: "Health",
    icon: "heart-pulse",
    color: "#EF4444",
    keywords: ["medicine", "medicines", "pharmacy", "doctor", "hospital", "apollo", "medplus", "clinic", "dentist", "lab test", "gym", "pharmeasy", "1mg"],
  },
  {
    key: "entertainment",
    name: "Entertainment",
    icon: "clapperboard",
    color: "#F97316",
    keywords: ["movie", "movies", "netflix", "spotify", "prime", "hotstar", "bookmyshow", "concert", "game", "games", "pvr", "inox", "youtube premium", "party"],
  },
  {
    key: "education",
    name: "Education",
    icon: "graduation-cap",
    color: "#14B8A6",
    keywords: ["book", "books", "course", "fees", "tuition", "udemy", "coursera", "exam", "stationery", "school", "college"],
  },
  {
    key: "travel",
    name: "Travel",
    icon: "plane",
    color: "#06B6D4",
    keywords: ["flight", "hotel", "trip", "makemytrip", "irctc", "goibibo", "airbnb", "oyo", "holiday", "vacation", "redbus"],
  },
  {
    key: "other",
    name: "Other",
    icon: "circle-ellipsis",
    color: "#94A3B8",
    keywords: [],
  },
];

export const CATEGORY_ICON_NAMES = [
  "utensils",
  "shopping-cart",
  "fuel",
  "car",
  "shopping-bag",
  "receipt",
  "home",
  "heart-pulse",
  "clapperboard",
  "graduation-cap",
  "plane",
  "circle-ellipsis",
  "gift",
  "coffee",
  "dumbbell",
  "smartphone",
  "zap",
  "paw-print",
  "baby",
  "briefcase",
  "bus",
  "shirt",
  "landmark",
] as const;

export const CATEGORY_COLORS = ["#4F46E5", "#10B981", "#0EA5E9", "#64748B", "#EC4899", "#F59E0B", "#8B5CF6", "#EF4444", "#F97316", "#14B8A6", "#06B6D4", "#94A3B8"];

// Display names for well-known merchants, matched case-insensitively.
export const KNOWN_MERCHANTS: Record<string, string> = {
  swiggy: "Swiggy",
  zomato: "Zomato",
  shell: "Shell",
  hp: "HP",
  iocl: "Indian Oil",
  "indian oil": "Indian Oil",
  bpcl: "BPCL",
  uber: "Uber",
  ola: "Ola",
  rapido: "Rapido",
  amazon: "Amazon",
  flipkart: "Flipkart",
  myntra: "Myntra",
  ajio: "AJIO",
  bigbasket: "BigBasket",
  blinkit: "Blinkit",
  zepto: "Zepto",
  dmart: "DMart",
  instamart: "Instamart",
  netflix: "Netflix",
  spotify: "Spotify",
  hotstar: "Hotstar",
  bookmyshow: "BookMyShow",
  pvr: "PVR",
  apollo: "Apollo",
  medplus: "MedPlus",
  starbucks: "Starbucks",
  dominos: "Domino's",
  kfc: "KFC",
  mcdonalds: "McDonald's",
  irctc: "IRCTC",
  makemytrip: "MakeMyTrip",
  airtel: "Airtel",
  jio: "Jio",
  decathlon: "Decathlon",
  nykaa: "Nykaa",
};
