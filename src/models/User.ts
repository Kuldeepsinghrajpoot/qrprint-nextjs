import mongoose, { Schema, Document, Model } from "mongoose";

export type UserRole = "owner" | "staff";

export interface IUser extends Document {
  shopId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  pin?: string; // short PIN for quick staff actions (e.g. confirming cash) on shared counter devices
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    shopId: { type: String, required: true, default: "main" },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["owner", "staff"], default: "staff" },
    pin: { type: String },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
