/**
 * Run with: npm run seed
 * Creates the first shop-owner login and a default pricing config,
 * so the dashboard is usable immediately after setup.
 */
import dotenv from "dotenv";

// Next.js keeps secrets in .env.local, but dotenv/config only reads .env — load both.
dotenv.config({ path: ".env.local" });
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set. Copy .env.local.example to .env.local first.");
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const shopName = (await rl.question("Shop name [My Print Shop]: ")) || "My Print Shop";
  const name = (await rl.question("Owner name [Shop Owner]: ")) || "Shop Owner";
  const email = (await rl.question("Owner email [owner@shop.com]: ")) || "owner@shop.com";
  const password = (await rl.question("Owner password [changeme123]: ")) || "changeme123";
  rl.close();

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const passwordHash = await bcrypt.hash(password, 10);
  await db.collection("users").updateOne(
    { email: email.toLowerCase() },
    {
      $set: {
        shopId: "main",
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: "owner",
      },
    },
    { upsert: true }
  );

  const DEFAULT_RATES = {
    A4: { bw: { page1: 5, page2to10: 4, page11plus: 3 }, color: { page1: 10, page2to10: 6, page11plus: 4 } },
    A3: { bw: { page1: 10, page2to10: 8, page11plus: 6 }, color: { page1: 18, page2to10: 12, page11plus: 8 } },
    Legal: { bw: { page1: 6, page2to10: 5, page11plus: 4 }, color: { page1: 12, page2to10: 7, page11plus: 5 } },
    Letter: { bw: { page1: 5, page2to10: 4, page11plus: 3 }, color: { page1: 10, page2to10: 6, page11plus: 4 } },
    Photo: { bw: { page1: 15, page2to10: 12, page11plus: 10 }, color: { page1: 20, page2to10: 16, page11plus: 12 } },
  };

  await db.collection("pricingconfigs").updateOne(
    { shopId: "main" },
    {
      $setOnInsert: {
        shopId: "main",
        shopName,
        rates: DEFAULT_RATES,
        duplexDiscountPercent: 10,
        bindingSpiralCharge: 20,
        bindingLaminationCharge: 5,
        priorityFeePercent: 25,
        gstEnabled: false,
        gstPercent: 18,
        cashPaymentEnabled: true,
        onlinePaymentEnabled: true,
      },
    },
    { upsert: true }
  );

  console.log(`\n✅ Owner account ready: ${email} / (the password you entered)`);
  console.log(`✅ Default pricing config created for shop "${shopName}"`);
  console.log(`\nLogin at /login once the app is running.\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
