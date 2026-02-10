import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
    internalId: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        default: ""
    },
    salesRep: {
        type: String,
        default: ""
    },
    salesTeamMember: {
        type: String,
        default: ""
    },
    contributionPercent: {
        type: String,
        default: ""
    },
    category: {
        type: String,
        default: ""
    },
    subCategory: {
        type: String,
        default: ""
    },
    companyName: {
        type: String,
        default: ""
    },
    location: {
        type: String,
        default: ""
    },
    status: {
        type: String,
        default: ""
    },
    globalSubscriptionStatus: {
        type: String,
        default: ""
    },
    isIndividual: {
        type: Boolean,
        default: false
    },
    dateOfLastOrder: {
        type: Date,
        default: null
    },
    dateCreated: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

export default mongoose.model("Customer", customerSchema);

