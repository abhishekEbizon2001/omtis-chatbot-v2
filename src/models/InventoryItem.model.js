import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  // Basic Information
  internalId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  itemName: {
    type: String,
    default: "",

  },

  // Omtis Information
  omtisId: {
    type: String,
    default: ""
  },
  omtisWineCategory: {
    type: String,
    default: ""
  },
  omtisNameDetail: {
    type: String,
    default: ""
  },
  omtisName: {
    type: String,
    default: ""
  },

  // Product Information
  unitType: {
    type: String,
    default: ""
  },
  purchaseDescription: {
    type: String,
    default: ""
  },
  productDescription: {
    type: String,
    default: ""
  },
  replenishmentId: {
    type: String,
    default: ""
  },

  // Inventory Classification
  inventoryCategory: {
    type: String,
    default: ""
  },
  inventorySubcategory: {
    type: String,
    default: ""
  },
  classification: {
    type: String,
    default: ""
  },

  // Wine Details
  producer: {
    type: String,
    default: ""
  },
  vintage: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    default: ""
  },
  bottleSize: {
    type: String,
    default: ""
  },

  // Geographic Information
  country: {
    type: String,
    default: ""
  },
  region: {
    type: String,
    default: ""
  },
  subRegion: {
    type: String,
    default: ""
  },
  appellation: {
    type: String,
    default: ""
  },

  // Weight Information
  itemWeight: {
    type: Number,
    default: 0
  },
  weightUnit: {
    type: String,
    default: ""
  },

  // Pricing Information
  price: {
    type: Number,
    default: 0.0
  },
  currency: {
    type: String,
    default: "HKD",  // Default currency
    enum: ["HKD", "EUR", "USD"]  // Add other currencies as needed
  },

  // New pricing field with trade and retail prices
  pricing: {
    tradePrice: {
      type: Number,
      default: 0.0
    },
    retailPrice: {
      type: Number,
      default: 0.0
    }
  },

  // Financial Information
  averageCost: {
    type: Number,
    default: 0.0
  },
  totalValue: {
    type: Number,
    default: 0.0
  },

  // Inventory Locations
  locations: [{
    locationId: {
      type: Number,
      required: true
    },
    location: {
      type: String,
      default: ""
    },
    address: {
      type: String,
      default: ""
    },
    city: {
      type: String,
      default: ""
    },
    country: {
      type: String,
      default: ""
    },
    zip: {
      type: String,
      default: ""
    },
    quantityOnHand: {
      type: Number,
      default: 0
    },
    quantityAvailable: {
      type: Number,
      default: 0
    }
  }],

  // Total Quantity (sum of quantityAvailable from all locations)
  totalQuantity: {
    type: Number,
    default: 0,
    index: true
  },

  // Raw data for debugging
  // rawData: {
  //   type: String,
  //   default: ""
  // },

  // Movement Information
  last_movement_date: {
    type: Date,
    default: null,
    index: true
  },
  moved_last_12_months: {
    type: Boolean,
    default: false,
    index: true
  },

  // Metadata
  lastSynced: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdDate: {
    type: Date,
    default: null
  },
  lastModifiedDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

export default mongoose.model('InventoryItem', inventoryItemSchema);