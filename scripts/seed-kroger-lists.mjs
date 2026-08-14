// node scripts/seed-kroger-lists.mjs
// One-time seed of each site's standard Kroger shopping list, built from the
// last 4 real delivery receipts for each site (exact UPCs, not guessed).
// "weekly" = appeared in 3-4 of the last 4 orders. "occasional" = 1-2.
// Safe to re-run: skips a site entirely if it already has saved-list rows,
// so it will never overwrite anything you've since edited in the app.

import pg from "pg";
import { readFileSync } from "fs";

const { Pool } = pg;
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && !key.startsWith("#") && rest.length) {
      let val = rest.join("=").trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key.trim()] = val;
    }
  }
} catch {}

const connString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
console.log("Connecting to:", connString?.replace(/:([^:@]+)@/, ":***@"));
const pool = new Pool({ connectionString: connString, ssl: connString?.includes("localhost") ? false : { rejectUnauthorized: false } });

// [upc, name, brand, defaultQty, frequency]
const NOAHS_ITEMS = [
  ["0002740026499", "Country Crock Original Buttery Vegetable Oil Spread, 45 oz", "Country Crock",  1, "weekly"],
  ["0001111014392", "Kroger 100% Whole Wheat Bread, 16 oz", "Kroger",  1, "weekly"],
  ["0001111089890", "Kroger Original Crackers, 13.7 oz", "Kroger",  1, "weekly"],
  ["0001111090393", "Kroger Original Graham Crackers, 14.4 oz", "Kroger",  1, "weekly"],
  ["0001111006906", "Kroger Baked Cheesy Bitz Cheddar Cheese Crackers, 12.4 oz", "Kroger",  1, "weekly"],
  ["0007225002109", "Wonder White Hamburger Buns, 8 ct / 15 oz", "Wonder",  1, "weekly"],
  ["0001111009143", "Kroger Pretzel Sticks, 15 oz", "Kroger",  1, "weekly"],
  ["0001111002278", "Kroger Toasted Oats Cereal Giant Size, 20 oz", "Kroger",  1, "weekly"],
  ["0001111005854", "Kroger Animal Crackers BIG DEAL!, 30 oz", "Kroger",  1, "occasional"],
  ["0001111088318", "Kroger Pure Cane Granulated Sugar, 4 lb", "Kroger",  1, "occasional"],
  ["0007373100830", "Mission Super Soft Flour Tortillas, Fajita Size, 20 ct", "Mission",  1, "occasional"],
  ["0001111099027", "Kroger Fajita Size Flour Tortillas, 20 ct / 23 oz", "Kroger",  1, "occasional"],
  ["0007373100415", "Mission Super Soft Soft Taco Size Flour Tortillas, 10 ct", "Mission",  1, "occasional"],
  ["0007294560134", "Sara Lee 100% Whole Wheat Bread, 20 oz", "Sara Lee",  1, "occasional"],
  ["0001111015658", "Smart Way Hot Dog Buns, 8 ct / 11 oz", "Smart Way",  1, "occasional"],
  ["0004800101159", "Knorr Granulated Chicken Flavor Bouillon, 2.0 lb", "Knorr",  1, "occasional"],
];

const LIGHTHOUSE_ITEMS = [
  ["0001111089890", "Kroger Original Crackers, 13.7 oz", "Kroger",  1, "weekly"],
  ["0001111090393", "Kroger Original Graham Crackers, 14.4 oz", "Kroger",  1, "weekly"],
  ["0001111006906", "Kroger Baked Cheesy Bitz Cheddar Cheese Crackers, 12.4 oz", "Kroger",  1, "weekly"],
  ["0002970005141", "Idahoan Value Size Buttery Homestyle Mashed Potatoes, 12 oz", "Idahoan",  1, "occasional"],
  ["0001111085021", "Kroger Elbow Macaroni, 16 oz", "Kroger",  1, "occasional"],
  ["0001111080580", "Kroger Original Tomato Ketchup, 38 oz", "Kroger",  1, "occasional"],
  ["0000000004640", "Romaine Lettuce, 1 ct", null,  1, "occasional"],
  ["0000000004061", "Wrapped Iceberg Lettuce, 1 ct", null,  1, "occasional"],
  ["0005000011234", "Coffee Mate Vanilla Caramel Coffee Creamer, 32 fl oz", "Coffee Mate",  1, "occasional"],
  ["0002740026499", "Country Crock Original Buttery Vegetable Oil Spread, 45 oz", "Country Crock",  1, "occasional"],
  ["0004127100955", "International Delight Caramel Macchiato Coffee Creamer, 32 fl oz", "International Delight",  1, "occasional"],
  ["0001111014392", "Kroger 100% Whole Wheat Bread, 16 oz", "Kroger",  1, "occasional"],
  ["0001111014538", "Kroger Nonstick Extra Virgin Olive Oil Cooking Spray, 5 oz", "Kroger",  1, "occasional"],
  ["0001111015000", "Kroger Original Medium Roast Ground Coffee, 29 oz", "Kroger",  1, "occasional"],
  ["0001111002278", "Kroger Toasted Oats Cereal Giant Size, 20 oz", "Kroger",  1, "occasional"],
  ["0002840004770", "Rold Gold Original Pretzel Sticks, 16 oz", "Rold Gold",  1, "occasional"],
  ["0007199800005", "Tony Chachere's Original Creole Seasoning, 17 oz", "Tony Chachere's",  1, "occasional"],
  ["0007225002109", "Wonder White Hamburger Buns, 8 ct / 15 oz", "Wonder",  1, "occasional"],
  ["0001111005854", "Kroger Animal Crackers BIG DEAL!, 30 oz", "Kroger",  1, "occasional"],
  ["0007373100830", "Mission Super Soft Flour Tortillas, Fajita Size, 20 ct", "Mission",  1, "occasional"],
  ["0005040073942", "Ball Park White Burger Buns, 8 ct / 15 oz", "Ball Park",  1, "occasional"],
  ["0003700097722", "Cascade Complete ActionPacs Dishwasher Detergent Pods, 78 ct", "Cascade",  1, "occasional"],
  ["0001111013598", "Kroger Ultra Concentrated Liquid Dish Soap Clean Scent, 75 fl oz", "Kroger",  1, "occasional"],
];

async function seedSite(site, items) {
  const existing = await pool.query("SELECT COUNT(*)::int AS n FROM kroger_saved_list_items WHERE site = $1", [site]);
  if (existing.rows[0].n > 0) {
    console.log(`Skipping ${site} — already has ${existing.rows[0].n} saved-list item(s).`);
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const [upc, name, brand, qty, frequency] = items[i];
    await pool.query(
      `INSERT INTO kroger_saved_list_items (site, upc, name, brand, default_quantity, frequency, is_custom, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
      [site, upc, name, brand, qty, frequency, i]
    );
  }
  console.log(`Seeded ${items.length} item(s) for ${site}.`);
}

try {
  await seedSite("Noah's Arks", NOAHS_ITEMS);
  await seedSite("Light House Academy", LIGHTHOUSE_ITEMS);
  console.log("✓ Done.");
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
