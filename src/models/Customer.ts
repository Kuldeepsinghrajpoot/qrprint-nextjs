import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICustomer extends Document {
  shopId: string;
  phone: string;
  name: string;
  totalOrders: number;
  totalSpent: number;
  loyaltyPoints: number;
  walletBalance: number;
  createdAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    shopId: { type: String, required: true, default: "main" },
    phone: { type: String, required: true },
    name: { type: String, required: true },
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    loyaltyPoints: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CustomerSchema.index({ shopId: 1, phone: 1 }, { unique: true });

export const Customer: Model<ICustomer> =
  mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);

/** 1 loyalty point per ₹20 spent — simple, easy to explain to customers. */
export function pointsForAmount(amount: number): number {
  return Math.floor(amount / 20);
}
