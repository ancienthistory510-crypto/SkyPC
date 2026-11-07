/* ============================================================
   PC Component Builder & Recommendation Engine
   ------------------------------------------------------------
   HOW TO EXTEND / CUSTOMIZE
   -------------------------
   1. PARTS DATABASE  — every sellable component lives in `PARTS`
      below, grouped by category. To add a part, copy an object
      and give it a unique `id`. Fields used by the compatibility
      engine are documented on each entry.
   2. PURCHASE LINKS  — every part gets a Shopee search URL from
      `buyUrl(part)` using the part's brand + name as the keyword.
      The Shopee domain follows the selected display currency.
   3. CURATED BUILDS  — `PRESETS` are hand-picked, guaranteed-
      compatible builds shown on the Recommendations tab.
   4. COMPATIBILITY   — `runCompatibility()` holds all rules.
      Add new checks by pushing result objects into `results`.
   5. STATE           — selections persist in localStorage and
      can be shared via the URL hash (?build=cpu:xxx,gpu:yyy).
   ============================================================ */

"use strict";

/* ============================================================
   CONFIG — change these constants to go live
   ============================================================ */

// Shopee domains by display currency.
const SHOPEE_DOMAINS = {
  USD: "shopee.com.my",
  MYR: "shopee.com.my",
  SD:  "shopee.sg",
  GBP: "shopee.com.my",
};

// Rough system overhead (fans, drives, USB, etc.) added to the
// CPU + GPU TDP when estimating total power draw.
const SYSTEM_OVERHEAD_W = 150;

// PSU headroom multiplier: required wattage = estimated load * this.
const PSU_HEADROOM = 1.2;

// PARTS prices and recommendation budgets are stored in USD.
// `money()` converts them to the selected display currency.
const CURRENCIES = {
  USD: { symbol: "$", rate: 1,    label: "USD" },
  MYR: { symbol: "RM", rate: 4.4,  label: "RM" },
  SD:  { symbol: "SD", rate: 1.35, label: "SD (Singapore Dollar)" },
  GBP: { symbol: "£", rate: 0.79, label: "GBP (Pound)" },
};

// Sky AI uses the Gemini API. Paste your API key here to enable chat.
const GEMINI_API_KEY = "AQ.Ab8RN6JYoevU6RD9gziVxf-2_6m3e7gNAbMtKOYz8iLQrG4dMw";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const SKY_AI_SYSTEM = "You are Sky AI, the built-in assistant for SkyPCBuilder, a static PC component builder website. Help users with PC building, compatibility, parts selection, budgets, Malaysian shopping, and how to use the site. Keep answers concise and practical.";

const money = (n) => {
  const currency = CURRENCIES[state.currency] || CURRENCIES.USD;
  return currency.symbol + (n * currency.rate).toLocaleString("en-US", { maximumFractionDigits: 2 });
};
const buyUrl = (part) => {
  const domain = SHOPEE_DOMAINS[state.currency] || SHOPEE_DOMAINS.MYR;
  const query = encodeURIComponent(`${part.brand} ${part.name}`);
  return `https://${domain}/search?keyword=${query}`;
};

/* ============================================================
   PARTS DATABASE
   ------------------------------------------------------------
   Common fields on every part:
     id, name, brand, price, category, specs[] (display rows),
     desc (short compatibility/marketing note)

   Compatibility fields per category:
     cpu:          socket, tdp, cores
     gpu:          lengthMm, tdp
     motherboard:  socket, formFactor ("ATX"|"mATX"|"ITX"),
                   ramType ("DDR4"|"DDR5"), ramSlots, m2Slots
     ram:          type ("DDR4"|"DDR5"), modules (sticks per kit)
     storage:      interface ("NVMe"|"SATA"), formFactor
                   ("M.2"|"2.5\""|"3.5\"")
     psu:          wattage, efficiency ("Bronze"|"Gold"|"Platinum")
     caseItem:     formFactors[], maxGpuLengthMm, maxCoolerHeightMm,
                   hddBays (count of 3.5" bays)
     cooling:      kind ("air"|"aio"), sockets[], heightMm (air),
                   radiatorMm (aio), tdpRating
   ============================================================ */

const PARTS = {

  /* ---------- CPU ---------- */
  cpu: [
    { id: "cpu-r5-5600",   name: "Ryzen 5 5600",          brand: "AMD",    price: 149, socket: "AM4",    tdp: 65,  cores: "6c/12t", specs: [["Socket","AM4"],["Cores","6 / 12"],["Boost","4.4 GHz"],["TDP","65 W"]], desc: "Reliable budget chip; pairs with cheap AM4 boards." },
    { id: "cpu-i5-12400f", name: "Core i5-12400F",        brand: "Intel", price: 109, socket: "LGA1700",tdp: 65,  cores: "6c/12t", specs: [["Socket","LGA1700"],["Cores","6 / 12"],["Boost","4.4 GHz"],["TDP","65 W"],["Note","No iGPU — needs a graphics card"]], desc: "Best budget gaming CPU; requires discrete GPU." },
    { id: "cpu-r5-7600",   name: "Ryzen 5 7600",          brand: "AMD",    price: 229, socket: "AM5",    tdp: 65,  cores: "6c/12t", specs: [["Socket","AM5"],["Cores","6 / 12"],["Boost","5.1 GHz"],["TDP","65 W"],["iGPU","Radeon 2 CU"]], desc: "Modern AM5 platform with upgrade headroom." },
    { id: "cpu-i5-14600k", name: "Core i5-14600K",        brand: "Intel", price: 299, socket: "LGA1700",tdp: 125, cores: "14c/20t",specs: [["Socket","LGA1700"],["Cores","14 / 20"],["Boost","5.3 GHz"],["TDP","125 W"],["iGPU","UHD 770"]], desc: "Strong gaming + productivity hybrid." },
    { id: "cpu-7800x3d",   name: "Ryzen 7 7800X3D",       brand: "AMD",    price: 449, socket: "AM5",    tdp: 120, cores: "8c/16t", specs: [["Socket","AM5"],["Cores","8 / 16"],["Boost","5.0 GHz"],["TDP","120 W"],["Note","No iGPU"],["X3D","3D V-Cache"]], desc: "The best gaming CPU money can buy." },
    { id: "cpu-i7-14700k", name: "Core i7-14700K",        brand: "Intel", price: 409, socket: "LGA1700",tdp: 125, cores: "20c/28t",specs: [["Socket","LGA1700"],["Cores","20 / 28"],["Boost","5.6 GHz"],["TDP","125 W"],["iGPU","UHD 770"]], desc: "Workstation-grade multicore performance." },
    { id: "cpu-r9-7950x",  name: "Ryzen 9 7950X",         brand: "AMD",    price: 699, socket: "AM5",    tdp: 170, cores: "16c/32t",specs: [["Socket","AM5"],["Cores","16 / 32"],["Boost","5.7 GHz"],["TDP","170 W"],["iGPU","Radeon 2 CU"]], desc: "Flagship desktop chip for heavy workloads." },
    { id: "cpu-i9-14900k", name: "Core i9-14900K",        brand: "Intel", price: 589, socket: "LGA1700",tdp: 125, cores: "24c/32t",specs: [["Socket","LGA1700"],["Cores","24 / 32"],["Boost","6.0 GHz"],["TDP","125 W"],["iGPU","UHD 770"]], desc: "Top-tier Intel for extreme productivity." },
    { id: "cpu-r5-5600g",  name: "Ryzen 5 5600G",         brand: "AMD",    price: 159, socket: "AM4",    tdp: 65,  cores: "6c/12t", specs: [["Socket","AM4"],["Cores","6 / 12"],["Boost","4.4 GHz"],["TDP","65 W"],["iGPU","Radeon 7 CU"]], desc: "Budget AM4 chip with integrated graphics." },
    { id: "cpu-r7-5700g",  name: "Ryzen 7 5700G",         brand: "AMD",    price: 259, socket: "AM4",    tdp: 65,  cores: "8c/16t", specs: [["Socket","AM4"],["Cores","8 / 16"],["Boost","4.6 GHz"],["TDP","65 W"],["iGPU","Radeon 8 CU"]], desc: "Strong AM4 upgrade with iGPU for lighter builds." },
    { id: "cpu-r7-5800x3d",name: "Ryzen 7 5800X3D",       brand: "AMD",    price: 449, socket: "AM4",    tdp: 105, cores: "8c/16t", specs: [["Socket","AM4"],["Cores","8 / 16"],["Boost","4.5 GHz"],["TDP","105 W"],["Note","No iGPU"],["X3D","3D V-Cache"]], desc: "AM4 gaming flagship; requires a graphics card." },
    { id: "cpu-r5-7500f",  name: "Ryzen 5 7500F",         brand: "AMD",    price: 179, socket: "AM5",    tdp: 65,  cores: "6c/12t", specs: [["Socket","AM5"],["Cores","6 / 12"],["Boost","5.0 GHz"],["TDP","65 W"],["Note","No iGPU"]], desc: "Efficient AM5 gaming chip; needs a discrete GPU." },
    { id: "cpu-r7-7700",   name: "Ryzen 7 7700",          brand: "AMD",    price: 299, socket: "AM5",    tdp: 65,  cores: "8c/16t", specs: [["Socket","AM5"],["Cores","8 / 16"],["Boost","5.3 GHz"],["TDP","65 W"],["iGPU","Radeon 2 CU"]], desc: "Balanced AM5 chip for gaming and streaming." },
    { id: "cpu-r9-9900x",  name: "Ryzen 9 9900X",         brand: "AMD",    price: 499, socket: "AM5",    tdp: 120, cores: "12c/24t",specs: [["Socket","AM5"],["Cores","12 / 24"],["Boost","5.6 GHz"],["TDP","120 W"],["iGPU","Radeon 2 CU"]], desc: "High-core AM5 chip for gaming plus heavy workloads." },
    { id: "cpu-i5-12400",  name: "Core i5-12400",         brand: "Intel", price: 129, socket: "LGA1700",tdp: 65,  cores: "6c/12t", specs: [["Socket","LGA1700"],["Cores","6 / 12"],["Boost","4.4 GHz"],["TDP","65 W"],["iGPU","UHD 730"]], desc: "Non-F budget chip that can run without a GPU." },
    { id: "cpu-i5-13400f", name: "Core i5-13400F",        brand: "Intel", price: 199, socket: "LGA1700",tdp: 148, cores: "10c/16t",specs: [["Socket","LGA1700"],["Cores","10 / 16"],["Boost","4.6 GHz"],["TDP","148 W"],["Note","No iGPU"]], desc: "Strong midrange chip; requires a graphics card." },
    { id: "cpu-i5-14400f", name: "Core i5-14400F",        brand: "Intel", price: 169, socket: "LGA1700",tdp: 148, cores: "10c/16t",specs: [["Socket","LGA1700"],["Cores","10 / 16"],["Boost","4.7 GHz"],["TDP","148 W"],["Note","No iGPU"]], desc: "Efficient 1440p gaming chip; needs a discrete GPU." },
    { id: "cpu-i7-13700k", name: "Core i7-13700K",        brand: "Intel", price: 389, socket: "LGA1700",tdp: 125, cores: "16c/24t",specs: [["Socket","LGA1700"],["Cores","16 / 24"],["Boost","5.4 GHz"],["TDP","125 W"],["iGPU","UHD 770"]], desc: "Previous-gen flagship still excellent for gaming." },
    { id: "cpu-i7-14700",  name: "Core i7-14700",         brand: "Intel", price: 329, socket: "LGA1700",tdp: 219, cores: "20c/28t",specs: [["Socket","LGA1700"],["Cores","20 / 28"],["Boost","5.4 GHz"],["TDP","219 W"],["iGPU","UHD 770"]], desc: "Workstation-grade multicore chip with iGPU." },
    { id: "cpu-i9-13900k", name: "Core i9-13900K",        brand: "Intel", price: 549, socket: "LGA1700",tdp: 125, cores: "24c/32t",specs: [["Socket","LGA1700"],["Cores","24 / 32"],["Boost","5.8 GHz"],["TDP","125 W"],["iGPU","UHD 770"]], desc: "Previous-gen Intel flagship for extreme builds." },
  ],

  /* ---------- GPU ---------- */
  gpu: [
    { id: "gpu-rx-7600",   name: "Radeon RX 7600 8GB",    brand: "AMD",    price: 269, lengthMm: 240, tdp: 165, specs: [["VRAM","8 GB GDDR6"],["Length","240 mm"],["TDP","165 W"],["Outputs","HDMI + 3×DP"]], desc: "1080p ultra / 1440p high esports-friendly card." },
    { id: "gpu-arc-a750",  name: "Arc A750 8GB",          brand: "Intel", price: 289, lengthMm: 272, tdp: 225, specs: [["VRAM","8 GB GDDR6"],["Length","272 mm"],["TDP","225 W"],["Outputs","HDMI + 3×DP"]], desc: "Great 1440p value; needs Resizable BAR ideally." },
    { id: "gpu-rtx-4060",  name: "GeForce RTX 4060 8GB",  brand: "NVIDIA",price: 299, lengthMm: 240, tdp: 115, specs: [["VRAM","8 GB GDDR6"],["Length","240 mm"],["TDP","115 W"],["DLSS","Frame Generation"]], desc: "Efficient 1080p/1440p card with ray tracing + DLSS." },
    { id: "gpu-rx-7800xt", name: "Radeon RX 7800 XT 16GB",brand: "AMD",    price: 499, lengthMm: 287, tdp: 263, specs: [["VRAM","16 GB GDDR6"],["Length","287 mm"],["TDP","263 W"],["Outputs","HDMI + 2×DP"]], desc: "Excellent 1440p raster performance." },
    { id: "gpu-rtx-4070s", name: "GeForce RTX 4070 Super",brand: "NVIDIA",price: 599, lengthMm: 267, tdp: 220, specs: [["VRAM","12 GB GDDR6X"],["Length","267 mm"],["TDP","220 W"],["DLSS","Frame Gen 3"]], desc: "High-refresh 1440p with full ray tracing." },
    { id: "gpu-rtx-4080s", name: "GeForce RTX 4080 Super",brand: "NVIDIA",price: 999, lengthMm: 310, tdp: 320, specs: [["VRAM","16 GB GDDR6X"],["Length","310 mm"],["TDP","320 W"],["DLSS","Frame Gen 3"]], desc: "4K-capable flagship-adjacent card." },
    { id: "gpu-rtx-4090",  name: "GeForce RTX 4090 24GB", brand: "NVIDIA",price: 1599,lengthMm: 336, tdp: 450, specs: [["VRAM","24 GB GDDR6X"],["Length","336 mm"],["TDP","450 W"],["DLSS","Frame Gen 3"]], desc: "The ultimate consumer GPU; needs serious cooling." },
    { id: "gpu-rx-6600",   name: "Radeon RX 6600 8GB",    brand: "AMD",    price: 199, lengthMm: 226, tdp: 132, specs: [["VRAM","8 GB GDDR6"],["Length","226 mm"],["TDP","132 W"],["Outputs","HDMI + 3×DP"]], desc: "Budget 1080p/1440p card with low power draw." },
    { id: "gpu-rx-6700xt", name: "Radeon RX 6700 XT 12GB",brand: "AMD",    price: 449, lengthMm: 267, tdp: 230, specs: [["VRAM","12 GB GDDR6"],["Length","267 mm"],["TDP","230 W"],["Outputs","HDMI + 3×DP"]], desc: "Strong 1440p raster performance." },
    { id: "gpu-rx-7900gre",name: "Radeon RX 7900 GRE 16GB",brand:"AMD",    price: 549, lengthMm: 287, tdp: 260, specs: [["VRAM","16 GB GDDR6"],["Length","287 mm"],["TDP","260 W"],["Outputs","HDMI + 2×DP"]], desc: "1440p ultra / entry 4K AMD card." },
    { id: "gpu-rx-7900xt", name: "Radeon RX 7900 XT 20GB",brand: "AMD",    price: 899, lengthMm: 331, tdp: 315, specs: [["VRAM","20 GB GDDR6"],["Length","331 mm"],["TDP","315 W"],["Outputs","HDMI + 2×DP"]], desc: "4K-capable RDNA 3 flagship." },
    { id: "gpu-arc-a380",  name: "Arc A380 6GB",          brand: "Intel", price: 139, lengthMm: 222, tdp: 75,  specs: [["VRAM","6 GB GDDR6"],["Length","222 mm"],["TDP","75 W"],["Outputs","3× DisplayPort"]], desc: "Very efficient 1080p entry card." },
    { id: "gpu-arc-a580",  name: "Arc A580 8GB",          brand: "Intel", price: 244, lengthMm: 272, tdp: 185, specs: [["VRAM","8 GB GDDR6"],["Length","272 mm"],["TDP","185 W"],["Outputs","HDMI + 3×DP"]], desc: "Solid 1440p value on Alchemist." },
    { id: "gpu-arc-b580",  name: "Arc B580 12GB",         brand: "Intel", price: 249, lengthMm: 272, tdp: 190, specs: [["VRAM","12 GB GDDR6"],["Length","272 mm"],["TDP","190 W"],["Outputs","HDMI + 3×DP"]], desc: "Newer Battlemage card for 1440p gaming." },
    { id: "gpu-rtx-4060ti",name: "GeForce RTX 4060 Ti 8GB",brand:"NVIDIA",price: 399, lengthMm: 240, tdp: 160, specs: [["VRAM","8 GB GDDR6"],["Length","240 mm"],["TDP","160 W"],["DLSS","Frame Generation"]], desc: "Faster 1440p option with ray tracing + DLSS." },
    { id: "gpu-rtx-4070",  name: "GeForce RTX 4070 12GB", brand: "NVIDIA",price: 549, lengthMm: 244, tdp: 200, specs: [["VRAM","12 GB GDDR6X"],["Length","244 mm"],["TDP","200 W"],["DLSS","Frame Gen 3"]], desc: "High-refresh 1440p with full RT support." },
    { id: "gpu-rtx-4070tis",name:"GeForce RTX 4070 Ti Super 16GB",brand:"NVIDIA",price: 799, lengthMm: 304, tdp: 285, specs: [["VRAM","16 GB GDDR6X"],["Length","304 mm"],["TDP","285 W"],["DLSS","Frame Gen 3"]], desc: "4K-capable card with strong ray tracing." },
    { id: "gpu-rtx-4080",  name: "GeForce RTX 4080 16GB", brand: "NVIDIA",price: 1199,lengthMm: 304, tdp: 320, specs: [["VRAM","16 GB GDDR6X"],["Length","304 mm"],["TDP","320 W"],["DLSS","Frame Gen 3"]], desc: "Premium 4K gaming performance." },
    { id: "gpu-rtx-3050",  name: "GeForce RTX 3050 6GB", brand: "NVIDIA",price: 129, lengthMm: 220, tdp: 70,  specs: [["VRAM","6 GB GDDR6"],["Length","220 mm"],["TDP","70 W"],["DLSS","DLSS 2"]], desc: "Entry RTX card for 1080p gaming." },
    { id: "gpu-rtx-3060",  name: "GeForce RTX 3060 12GB",brand: "NVIDIA",price: 249, lengthMm: 242, tdp: 170, specs: [["VRAM","12 GB GDDR6"],["Length","242 mm"],["TDP","170 W"],["DLSS","DLSS 2"]], desc: "Still strong 1080p/1440p value on Ampere." },
    { id: "gpu-rtx-3060ti",name: "GeForce RTX 3060 Ti 8GB",brand:"NVIDIA",price: 299, lengthMm: 250, tdp: 200, specs: [["VRAM","8 GB GDDR6"],["Length","250 mm"],["TDP","200 W"],["DLSS","DLSS 2"]], desc: "Faster 3060 option for 1440p." },
    { id: "gpu-rtx-3070",  name: "GeForce RTX 3070 8GB", brand: "NVIDIA",price: 349, lengthMm: 267, tdp: 220, specs: [["VRAM","8 GB GDDR6"],["Length","267 mm"],["TDP","220 W"],["DLSS","DLSS 2"]], desc: "High-refresh 1440p Ampere card." },
    { id: "gpu-rtx-3070ti",name: "GeForce RTX 3070 Ti 8GB",brand:"NVIDIA",price: 449, lengthMm: 267, tdp: 290, specs: [["VRAM","8 GB GDDR6X"],["Length","267 mm"],["TDP","290 W"],["DLSS","DLSS 2"]], desc: "Enthusiast 1440p card from the 30 series." },
    { id: "gpu-rtx-3080",  name: "GeForce RTX 3080 10GB",brand: "NVIDIA",price: 549, lengthMm: 285, tdp: 320, specs: [["VRAM","10 GB GDDR6X"],["Length","285 mm"],["TDP","320 W"],["DLSS","DLSS 2"]], desc: "4K-capable Ampere GPU." },
    { id: "gpu-rtx-3080ti",name: "GeForce RTX 3080 Ti 12GB",brand:"NVIDIA",price: 699, lengthMm: 285, tdp: 350, specs: [["VRAM","12 GB GDDR6X"],["Length","285 mm"],["TDP","350 W"],["DLSS","DLSS 2"]], desc: "Near-4090 performance from the 30 series." },
    { id: "gpu-rtx-3090",  name: "GeForce RTX 3090 24GB",brand: "NVIDIA",price: 999, lengthMm: 313, tdp: 350, specs: [["VRAM","24 GB GDDR6X"],["Length","313 mm"],["TDP","350 W"],["DLSS","DLSS 2"]], desc: "Flagship Ampere card with huge VRAM for creators." },
    { id: "gpu-rtx-4060ti-16",name:"GeForce RTX 4060 Ti 16GB",brand:"NVIDIA",price: 449, lengthMm: 240, tdp: 165, specs: [["VRAM","16 GB GDDR6"],["Length","240 mm"],["TDP","165 W"],["DLSS","Frame Generation"]], desc: "Higher-VRAM 4060 Ti variant for longevity." },
    { id: "gpu-rtx-4070ti",name: "GeForce RTX 4070 Ti 12GB",brand:"NVIDIA",price: 749, lengthMm: 285, tdp: 285, specs: [["VRAM","12 GB GDDR6X"],["Length","285 mm"],["TDP","285 W"],["DLSS","Frame Gen 3"]], desc: "Strong 4K-entry Ada card." },
    { id: "gpu-rtx-5060",   name: "GeForce RTX 5060 8GB", brand: "NVIDIA",price: 299, lengthMm: 240, tdp: 145, specs: [["VRAM","8 GB GDDR7"],["Length","240 mm"],["TDP","145 W"],["DLSS","DLSS 4 / Frame Gen"]], desc: "Efficient Blackwell card for 1080p/1440p." },
    { id: "gpu-rtx-5060ti", name: "GeForce RTX 5060 Ti 16GB",brand:"NVIDIA",price: 429, lengthMm: 244, tdp: 180, specs: [["VRAM","16 GB GDDR7"],["Length","244 mm"],["TDP","180 W"],["DLSS","DLSS 4 / Frame Gen"]], desc: "1440p Blackwell value with 16GB VRAM." },
    { id: "gpu-rtx-5070",   name: "GeForce RTX 5070 12GB",brand: "NVIDIA",price: 549, lengthMm: 285, tdp: 250, specs: [["VRAM","12 GB GDDR7"],["Length","285 mm"],["TDP","250 W"],["DLSS","DLSS 4 / Frame Gen"]], desc: "High-refresh 1440p and entry 4K Blackwell." },
    { id: "gpu-rtx-5070ti", name: "GeForce RTX 5070 Ti 16GB",brand:"NVIDIA",price: 749, lengthMm: 304, tdp: 300, specs: [["VRAM","16 GB GDDR7"],["Length","304 mm"],["TDP","300 W"],["DLSS","DLSS 4 / Frame Gen"]], desc: "4K-ready Blackwell performance." },
    { id: "gpu-rtx-5080",   name: "GeForce RTX 5080 16GB",brand: "NVIDIA",price: 999, lengthMm: 304, tdp: 360, specs: [["VRAM","16 GB GDDR7"],["Length","304 mm"],["TDP","360 W"],["DLSS","DLSS 4 / Frame Gen"]], desc: "Premium 4K Blackwell GPU." },
    { id: "gpu-rtx-5090",   name: "GeForce RTX 5090 32GB",brand: "NVIDIA",price: 1999,lengthMm: 358, tdp: 575, specs: [["VRAM","32 GB GDDR7"],["Length","358 mm"],["TDP","575 W"],["DLSS","DLSS 4 / Frame Gen"]], desc: "Flagship Blackwell; needs top-tier cooling and PSU." },
  ],

  /* ---------- Motherboard ---------- */
  motherboard: [
    { id: "mb-b550-aorus", name: "B550 Aorus Elite",       brand: "Gigabyte", socket: "AM4",     formFactor: "ATX", ramType: "DDR4", ramSlots: 4, m2Slots: 2, price: 129, specs: [["Socket","AM4"],["Form","ATX"],["RAM","DDR4 · 4 slots"],["M.2","2× NVMe"],["WiFi","No"]], desc: "Budget AM4 workhorse." },
    { id: "mb-b650m-mortar",name:"B650M Mortar WiFi",      brand: "MSI",      socket: "AM5",     formFactor: "mATX",ramType: "DDR5", ramSlots: 4, m2Slots: 2, price: 159, specs: [["Socket","AM5"],["Form","micro-ATX"],["RAM","DDR5 · 4 slots"],["M.2","2× NVMe"],["WiFi","Yes"]], desc: "Best-value AM5 board." },
    { id: "mb-b760m-plus",  name: "TUF B760M-Plus",        brand: "ASUS",     socket: "LGA1700", formFactor: "mATX",ramType: "DDR5", ramSlots: 4, m2Slots: 2, price: 179, specs: [["Socket","LGA1700"],["Form","micro-ATX"],["RAM","DDR5 · 4 slots"],["M.2","2× NVMe"],["WiFi","No"]], desc: "Solid midrange Intel board." },
    { id: "mb-b760-tomahawk",name:"B760 Tomahawk",         brand: "MSI",      socket: "LGA1700", formFactor: "ATX", ramType: "DDR5", ramSlots: 4, m2Slots: 3, price: 199, specs: [["Socket","LGA1700"],["Form","ATX"],["RAM","DDR5 · 4 slots"],["M.2","3× NVMe"],["WiFi","No"]], desc: "Great VRM cooling for K-series chips." },
    { id: "mb-b650e-f",     name: "ROG Strix B650E-F",      brand: "ASUS",     socket: "AM5",     formFactor: "ATX", ramType: "DDR5", ramSlots: 4, m2Slots: 2, price: 279, specs: [["Socket","AM5"],["Form","ATX"],["RAM","DDR5 · 4 slots"],["M.2","2× NVMe (PCIe 5.0)"],["WiFi","Yes"]], desc: "PCIe 5.0 GPU + M.2 for AM5." },
    { id: "mb-b650e-i",     name: "ROG Strix B650E-I",      brand: "ASUS",     socket: "AM5",     formFactor: "ITX", ramType: "DDR5", ramSlots: 2, m2Slots: 2, price: 329, specs: [["Socket","AM5"],["Form","Mini-ITX"],["RAM","DDR5 · 2 slots"],["M.2","2× NVMe"],["WiFi","Yes"]], desc: "Flagship features in a tiny footprint." },
    { id: "mb-z790-e",      name: "ROG Strix Z790-E",       brand: "ASUS",     socket: "LGA1700", formFactor: "ATX", ramType: "DDR5", ramSlots: 4, m2Slots: 4, price: 549, specs: [["Socket","LGA1700"],["Form","ATX"],["RAM","DDR5 · 4 slots"],["M.2","4× NVMe"],["WiFi","Yes"]], desc: "Overclocking + connectivity king." },
    { id: "mb-b550m-ds3h", name: "B550M DS3H",            brand: "Gigabyte", socket: "AM4",     formFactor: "mATX",ramType: "DDR4", ramSlots: 4, m2Slots: 1, price: 99,  specs: [["Socket","AM4"],["Form","micro-ATX"],["RAM","DDR4 · 4 slots"],["M.2","1× NVMe"],["WiFi","No"]], desc: "Compact budget AM4 board." },
    { id: "mb-x570s-aorus",name: "X570S Aorus Elite",      brand: "Gigabyte", socket: "AM4",     formFactor: "ATX", ramType: "DDR4", ramSlots: 4, m2Slots: 2, price: 189, specs: [["Socket","AM4"],["Form","ATX"],["RAM","DDR4 · 4 slots"],["M.2","2× NVMe"],["WiFi","No"]], desc: "PCIe 4.0 AM4 board with strong VRMs." },
    { id: "mb-b650m-ds3h", name: "B650M DS3H",            brand: "Gigabyte", socket: "AM5",     formFactor: "mATX",ramType: "DDR5", ramSlots: 4, m2Slots: 1, price: 139, specs: [["Socket","AM5"],["Form","micro-ATX"],["RAM","DDR5 · 4 slots"],["M.2","1× NVMe"],["WiFi","No"]], desc: "Entry AM5 board for budget DDR5 builds." },
    { id: "mb-x670e-aorus",name: "X670E Aorus Master",    brand: "Gigabyte", socket: "AM5",     formFactor: "ATX", ramType: "DDR5", ramSlots: 4, m2Slots: 2, price: 329, specs: [["Socket","AM5"],["Form","ATX"],["RAM","DDR5 · 4 slots"],["M.2","2× NVMe (PCIe 5.0)"],["WiFi","Yes"]], desc: "Enthusiast AM5 board with USB4 support." },
    { id: "mb-b550m-mortar",name:"B550M Mortar WiFi",     brand: "MSI",      socket: "AM4",     formFactor: "mATX",ramType: "DDR4", ramSlots: 4, m2Slots: 2, price: 129, specs: [["Socket","AM4"],["Form","micro-ATX"],["RAM","DDR4 · 4 slots"],["M.2","2× NVMe"],["WiFi","Yes"]], desc: "Reliable budget AM4 board with WiFi." },
    { id: "mb-x570-tomahawk",name:"X570 Tomahawk",        brand: "MSI",      socket: "AM4",     formFactor: "ATX", ramType: "DDR4", ramSlots: 4, m2Slots: 2, price: 179, specs: [["Socket","AM4"],["Form","ATX"],["RAM","DDR4 · 4 slots"],["M.2","2× NVMe"],["WiFi","No"]], desc: "Classic AM4 overclocking board." },
    { id: "mb-b650-tomahawk",name:"B650 Tomahawk WiFi",   brand: "MSI",      socket: "AM5",     formFactor: "ATX", ramType: "DDR5", ramSlots: 4, m2Slots: 3, price: 219, specs: [["Socket","AM5"],["Form","ATX"],["RAM","DDR5 · 4 slots"],["M.2","3× NVMe"],["WiFi","Yes"]], desc: "Full-size AM5 board with strong VRMs." },
    { id: "mb-b760m-mortar",name:"B760M Mortar WiFi",     brand: "MSI",      socket: "LGA1700", formFactor: "mATX",ramType: "DDR5", ramSlots: 4, m2Slots: 2, price: 189, specs: [["Socket","LGA1700"],["Form","micro-ATX"],["RAM","DDR5 · 4 slots"],["M.2","2× NVMe"],["WiFi","Yes"]], desc: "Compact Intel board with WiFi and good VRMs." },
    { id: "mb-prime-b550m-a",name:"PRIME B550M-A",        brand: "ASUS",     socket: "AM4",     formFactor: "mATX",ramType: "DDR4", ramSlots: 4, m2Slots: 1, price: 99,  specs: [["Socket","AM4"],["Form","micro-ATX"],["RAM","DDR4 · 4 slots"],["M.2","1× NVMe"],["WiFi","No"]], desc: "Cheapest entry into AM4 builds." },
    { id: "mb-tuf-x570-plus",name:"TUF X570-PLUS",        brand: "ASUS",     socket: "AM4",     formFactor: "ATX", ramType: "DDR4", ramSlots: 4, m2Slots: 2, price: 169, specs: [["Socket","AM4"],["Form","ATX"],["RAM","DDR4 · 4 slots"],["M.2","2× NVMe"],["WiFi","No"]], desc: "Durable AM4 board for Ryzen 5000." },
    { id: "mb-prime-b650m-a",name:"PRIME B650M-A",        brand: "ASUS",     socket: "AM5",     formFactor: "mATX",ramType: "DDR5", ramSlots: 4, m2Slots: 1, price: 139, specs: [["Socket","AM5"],["Form","micro-ATX"],["RAM","DDR5 · 4 slots"],["M.2","1× NVMe"],["WiFi","No"]], desc: "Budget AM5 board for DDR5 builds." },
    { id: "mb-tuf-b760-plus",name:"TUF Gaming B760-PLUS",brand: "ASUS",     socket: "LGA1700", formFactor: "ATX", ramType: "DDR5", ramSlots: 4, m2Slots: 2, price: 209, specs: [["Socket","LGA1700"],["Form","ATX"],["RAM","DDR5 · 4 slots"],["M.2","2× NVMe"],["WiFi","No"]], desc: "Full-size Intel board with strong power stages." },
  ],

  /* ---------- RAM ---------- */
  ram: [
    { id: "ram-16-ddr4",    name: "Vengeance LPX 16GB (2×8)",brand: "Corsair",type: "DDR4", modules: 2, price: 45,  specs: [["Type","DDR4-3200"],["Capacity","16 GB"],["Sticks","2× 8 GB"]], desc: "Entry-level kit for AM4/LGA1700 DDR4 boards." },
    { id: "ram-32-ddr4",    name: "Fury Beast 32GB (2×16)",  brand: "Kingston",type:"DDR4", modules: 2, price: 65,  specs: [["Type","DDR4-3600"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Sweet spot for DDR4 gaming builds." },
    { id: "ram-32-ddr5",    name: "Vengeance 32GB (2×16)",  brand: "Corsair",type: "DDR5", modules: 2, price: 95,  specs: [["Type","DDR5-6000"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Sweet spot for AM5 — runs at EXPO 6000." },
    { id: "ram-64-ddr5",    name: "Ripjaws 64GB (2×32)",     brand: "G.Skill", type: "DDR5", modules: 2, price: 169, specs: [["Type","DDR5-6000"],["Capacity","64 GB"],["Sticks","2× 32 GB"]], desc: "Heavy multitasking / workstation memory." },
    { id: "ram-64-ddr5-z5", name: "Trident Z5 64GB (2×32)", brand: "G.Skill", type: "DDR5", modules: 2, price: 199, specs: [["Type","DDR5-6400 CL32"],["Capacity","64 GB"],["Sticks","2× 32 GB"]], desc: "Fast, low-latency DDR5 for enthusiasts." },
    { id: "ram-8-ddr4",     name: "Vengeance LPX 8GB (1×8)", brand: "Corsair",type: "DDR4", modules: 1, price: 25,  specs: [["Type","DDR4-3200"],["Capacity","8 GB"],["Sticks","1× 8 GB"]], desc: "Single-stick budget memory." },
    { id: "ram-32-ddr4-c",  name: "Vengeance LPX 32GB (2×16)",brand:"Corsair",type: "DDR4", modules: 2, price: 75,  specs: [["Type","DDR4-3600"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Roomy DDR4 kit for AM4/LGA1700 builds." },
    { id: "ram-32-ddr5-6000",name:"Dominator Platinum 32GB (2×16)",brand:"Corsair",type:"DDR5", modules: 2, price: 139, specs: [["Type","DDR5-6000 CL30"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Premium DDR5 kit with tight timings." },
    { id: "ram-64-ddr5-6400",name:"Dominator Platinum 64GB (2×32)",brand:"Corsair",type:"DDR5", modules: 2, price: 249, specs: [["Type","DDR5-6400 CL32"],["Capacity","64 GB"],["Sticks","2× 32 GB"]], desc: "High-capacity DDR5 for workstations." },
    { id: "ram-16-ddr4-k",  name: "Fury Beast 16GB (2×8)", brand: "Kingston",type: "DDR4", modules: 2, price: 35,  specs: [["Type","DDR4-3200"],["Capacity","16 GB"],["Sticks","2× 8 GB"]], desc: "Budget dual-channel DDR4 kit." },
    { id: "ram-32-ddr5-k",  name: "Fury Beast 32GB (2×16)",brand: "Kingston",type: "DDR5", modules: 2, price: 109, specs: [["Type","DDR5-6000"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Plug-and-play DDR5 for AM5 builds." },
    { id: "ram-64-ddr5-k",  name: "Server Premier 64GB (2×32)",brand:"Kingston",type:"DDR5", modules: 2, price: 229, specs: [["Type","DDR5-5600"],["Capacity","64 GB"],["Sticks","2× 32 GB"]], desc: "Stable high-capacity DDR5 for servers/VMs." },
    { id: "ram-32-ddr4-g",  name: "Ripjaws V 32GB (2×16)", brand: "G.Skill", type: "DDR4", modules: 2, price: 59,  specs: [["Type","DDR4-3600"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Reliable DDR4 kit for gaming builds." },
    { id: "ram-32-ddr5-g",  name: "Ripjaws S5 32GB (2×16)",brand: "G.Skill", type: "DDR5", modules: 2, price: 89,  specs: [["Type","DDR5-6000"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Sweet-spot DDR5 kit for AM5." },
    { id: "ram-32-ddr5-z5-g",name:"Trident Z5 32GB (2×16)",brand:"G.Skill", type: "DDR5", modules: 2, price: 129, specs: [["Type","DDR5-6400 CL32"],["Capacity","32 GB"],["Sticks","2× 16 GB"]], desc: "Fast low-latency DDR5 for enthusiasts." },
  ],

  /* ---------- Storage ---------- */
  storage: [
    { id: "ssd-p3-1tb",     name: "Crucial P3 1TB NVMe",    brand: "Crucial", interface: "NVMe", formFactor: "M.2", price: 55,  specs: [["Interface","NVMe PCIe 3.0"],["Capacity","1 TB"],["Form","M.2 2280"]], desc: "Fast-enough budget NVMe boot drive." },
    { id: "ssd-sn850x-1tb", name: "WD Black SN850X 1TB",     brand: "Western Digital", interface: "NVMe", formFactor: "M.2", price: 89, specs: [["Interface","NVMe PCIe 4.0"],["Capacity","1 TB"],["Form","M.2 2280"]], desc: "Top-tier Gen4 speeds." },
    { id: "ssd-870evo-2tb", name: "Samsung 870 EVO 2TB",    brand: "Samsung",interface: "SATA", formFactor: "2.5\"", price: 129, specs: [["Interface","SATA III"],["Capacity","2 TB"],["Form","2.5-inch"],["Note","Needs SATA data + power ports"]], desc: "Reliable SATA SSD; check case has 2.5\" mounts." },
    { id: "hdd-barra-4tb",  name: "BarraCuda 4TB HDD",       brand: "Seagate",interface: "SATA", formFactor: "3.5\"", price: 79,  specs: [["Interface","SATA III"],["Capacity","4 TB"],["Form","3.5-inch"],["RPM","5400"]], desc: "Bulk storage — needs a free 3.5\" bay." },
    { id: "ssd-990pro-2tb", name: "Samsung 990 Pro 2TB",     brand: "Samsung",interface: "NVMe", formFactor: "M.2", price: 149, specs: [["Interface","NVMe PCIe 4.0"],["Capacity","2 TB"],["Form","M.2 2280"],["Read","7450 MB/s"]], desc: "Fastest mainstream Gen4 drive." },
    { id: "hdd-blue-2tb",   name: "WD Blue 2TB HDD",         brand: "Western Digital", interface:"SATA",formFactor:"3.5\"", price: 59, specs: [["Interface","SATA III"],["Capacity","2 TB"],["Form","3.5-inch"]], desc: "Budget mass storage." },
    { id: "ssd-p3plus-1tb", name: "Crucial P3 Plus 1TB NVMe",brand: "Crucial", interface: "NVMe", formFactor: "M.2", price: 65,  specs: [["Interface","NVMe PCIe 4.0"],["Capacity","1 TB"],["Form","M.2 2280"]], desc: "Budget Gen4 NVMe boot drive." },
    { id: "ssd-mx500-1tb", name: "Crucial MX500 1TB SATA", brand: "Crucial", interface: "SATA", formFactor: "2.5\"", price: 75, specs: [["Interface","SATA III"],["Capacity","1 TB"],["Form","2.5-inch"]], desc: "Reliable SATA SSD for older systems." },
    { id: "ssd-sn770-1tb", name: "WD Black SN770 1TB",    brand: "Western Digital", interface: "NVMe", formFactor: "M.2", price: 69, specs: [["Interface","NVMe PCIe 4.0"],["Capacity","1 TB"],["Form","M.2 2280"]], desc: "Efficient Gen4 drive without a heatsink." },
    { id: "hdd-red-6tb",    name: "WD Red Plus 6TB HDD",   brand: "Western Digital", interface: "SATA", formFactor: "3.5\"", price: 129, specs: [["Interface","SATA III"],["Capacity","6 TB"],["Form","3.5-inch"],["Use","NAS / 24×7"]], desc: "NAS-rated bulk storage; needs a 3.5\" bay." },
    { id: "ssd-990evo-1tb", name: "Samsung 990 Evo 1TB",  brand: "Samsung",interface: "NVMe", formFactor: "M.2", price: 99,  specs: [["Interface","NVMe PCIe 4.0"],["Capacity","1 TB"],["Form","M.2 2280"],["Read","5000 MB/s"]], desc: "Mainstream Gen4 drive with strong endurance." },
    { id: "ssd-870evo-1tb", name: "Samsung 870 EVO 1TB",  brand: "Samsung",interface: "SATA", formFactor: "2.5\"", price: 69, specs: [["Interface","SATA III"],["Capacity","1 TB"],["Form","2.5-inch"]], desc: "Reliable SATA SSD; needs SATA data + power." },
    { id: "hdd-ironwolf-4tb",name:"Seagate IronWolf 4TB", brand: "Seagate",interface: "SATA", formFactor: "3.5\"", price: 99, specs: [["Interface","SATA III"],["Capacity","4 TB"],["Form","3.5-inch"],["Use","NAS / 24×7"]], desc: "NAS-rated drive for always-on storage." },
    { id: "ssd-firecuda-1tb",name:"Seagate FireCuda 510 1TB",brand:"Seagate",interface:"NVMe",formFactor:"M.2", price: 79, specs: [["Interface","NVMe PCIe 3.0"],["Capacity","1 TB"],["Form","M.2 2280"]], desc: "Budget NVMe drive for gaming builds." },
  ],

  /* ---------- PSU ---------- */
  psu: [
    { id: "psu-evga-500",   name: "EVGA 500 BR",            brand: "EVGA",    wattage: 500,  efficiency: "Bronze",    price: 49,  specs: [["Wattage","500 W"],["Efficiency","80+ Bronze"],["Form","ATX"]], desc: "Minimum for integrated-graphics or low-power builds." },
    { id: "psu-rm650e",     name: "Corsair RM650e",         brand: "Corsair", wattage: 650,  efficiency: "Gold",      price: 79,  specs: [["Wattage","650 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Covers midrange single-GPU systems." },
    { id: "psu-rm750e",     name: "Corsair RM750e",         brand: "Corsair", wattage: 750,  efficiency: "Gold",      price: 99,  specs: [["Wattage","750 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Safe headroom for ~300W GPUs." },
    { id: "psu-gx-850",     name: "Seasonic Focus GX-850",  brand: "Seasonic", wattage: 850,  efficiency: "Gold",      price: 139, specs: [["Wattage","850 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Premium platform for high-end builds." },
    { id: "psu-hx1000i",    name: "Corsair HX1000i",        brand: "Corsair", wattage: 1000, efficiency: "Platinum",  price: 219, specs: [["Wattage","1000 W"],["Efficiency","80+ Platinum"],["Modular","Fully"]], desc: "For RTX 4090-class systems." },
    { id: "psu-bq-1000",    name: "Straight Power 12 1000W",brand: "be quiet!",wattage: 1000, efficiency: "Gold",      price: 189, specs: [["Wattage","1000 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Quiet, efficient flagship PSU." },
    { id: "psu-evga-600-br", name: "EVGA 600 BR",           brand: "EVGA",    wattage: 600,  efficiency: "Bronze",    price: 59,  specs: [["Wattage","600 W"],["Efficiency","80+ Bronze"],["Form","ATX"]], desc: "Budget PSU for midrange builds." },
    { id: "psu-evga-850-g", name: "EVGA SuperNOVA 850 G+", brand: "EVGA",    wattage: 850,  efficiency: "Gold",      price: 129, specs: [["Wattage","850 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Gold-rated headroom for high-end GPUs." },
    { id: "psu-rm550e",     name: "Corsair RM550e",        brand: "Corsair", wattage: 550,  efficiency: "Gold",      price: 69,  specs: [["Wattage","550 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Compact Gold PSU for budget-mid builds." },
    { id: "psu-rm850e",     name: "Corsair RM850e",        brand: "Corsair", wattage: 850,  efficiency: "Gold",      price: 119, specs: [["Wattage","850 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Efficient choice for ~300W GPUs." },
    { id: "psu-hx1200i",    name: "Corsair HX1200i",       brand: "Corsair", wattage: 1200, efficiency: "Platinum",  price: 279, specs: [["Wattage","1200 W"],["Efficiency","80+ Platinum"],["Modular","Fully"]], desc: "Extreme headroom for flagship systems." },
    { id: "psu-gx-750",     name: "Seasonic Focus GX-750", brand: "Seasonic", wattage: 750,  efficiency: "Gold",      price: 119, specs: [["Wattage","750 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Quiet Gold PSU for single-GPU builds." },
    { id: "psu-tx-1000",    name: "Seasonic Prime TX-1000",brand: "Seasonic", wattage: 1000, efficiency: "Platinum",  price: 219, specs: [["Wattage","1000 W"],["Efficiency","80+ Platinum"],["Modular","Fully"]], desc: "Platinum efficiency for enthusiast builds." },
    { id: "psu-sp11-750",   name: "Straight Power 11 750W",brand: "be quiet!",wattage: 750,  efficiency: "Gold",      price: 139, specs: [["Wattage","750 W"],["Efficiency","80+ Gold"],["Modular","Fully"]], desc: "Silent Gold PSU with strong acoustics." },
    { id: "psu-dp13-1000",  name: "Dark Power 13 1000W",   brand: "be quiet!",wattage: 1000, efficiency: "Platinum",  price: 249, specs: [["Wattage","1000 W"],["Efficiency","80+ Platinum"],["Modular","Fully"]], desc: "Flagship silent Platinum PSU." },
  ],

  /* ---------- Case (key: `caseItem` to avoid reserved word) ---------- */
  caseItem: [
    { id: "case-pop-air",   name: "Fractal Pop Air",        brand: "Fractal Design", formFactors: ["ATX","mATX","ITX"], maxGpuLengthMm: 405, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280], price: 89, specs: [["Form","ATX / mATX / ITX"],["GPU max","405 mm"],["Cooler max","170 mm"],["3.5\" bays","2"]], desc: "Airflow-focused mid-tower." },
    { id: "case-h5-flow",   name: "NZXT H5 Flow",           brand: "NZXT",   formFactors: ["ATX","mATX","ITX"], maxGpuLengthMm: 365, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 89, specs: [["Form","ATX / mATX / ITX"],["GPU max","365 mm"],["Cooler max","170 mm"],["Radiator","up to 360"]], desc: "Sleek mesh front, great cable options." },
    { id: "case-lancool-216",name:"Lian Li Lancool 216",    brand: "Lian Li",formFactors: ["ATX","mATX","ITX"], maxGpuLengthMm: 392, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 99, specs: [["Form","ATX / mATX / ITX"],["GPU max","392 mm"],["Cooler max","170 mm"],["Radiator","up to 360"]], desc: "Dual-chamber airflow monster." },
    { id: "case-p400a",     name: "Eclipse P400A Digital",  brand: "Phanteks",formFactors:["ATX","mATX","ITX"], maxGpuLengthMm: 400, maxCoolerHeightMm: 190, hddBays: 3, radiatorMm: [240, 280, 360], price: 119, specs: [["Form","ATX / mATX / ITX"],["GPU max","400 mm"],["Cooler max","190 mm"],["3.5\" bays","3"],["Radiator","up to 360"]], desc: "Room for flagship coolers and GPUs." },
    { id: "case-nr200p",    name: "Cooler Master NR200P",   brand: "Cooler Master", formFactors:["ITX"], maxGpuLengthMm: 330, maxCoolerHeightMm: 165, hddBays: 0, radiatorMm: [240, 280], price: 99, specs: [["Form","Mini-ITX only"],["GPU max","330 mm"],["Cooler max","165 mm"],["3.5\" bays","0 (2.5\" only)"]], desc: "Tiny SFF chassis — ITX motherboards only." },
    { id: "case-north",     name: "Fractal Design North",  brand: "Fractal Design", formFactors: ["ATX","mATX","ITX"], maxGpuLengthMm: 355, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 139, specs: [["Form","ATX / mATX / ITX"],["GPU max","355 mm"],["Cooler max","170 mm"],["3.5\" bays","2"],["Radiator","up to 360"]], desc: "Wood-and-mesh mid-tower with strong airflow." },
    { id: "case-meshify2c",name: "Meshify 2 Compact",      brand: "Fractal Design", formFactors: ["mATX","ITX"], maxGpuLengthMm: 355, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 119, specs: [["Form","micro-ATX / ITX"],["GPU max","355 mm"],["Cooler max","170 mm"],["3.5\" bays","2"],["Radiator","up to 360"]], desc: "Compact mesh case for mATX/ITX builds." },
    { id: "case-h7-flow",   name: "NZXT H7 Flow",          brand: "NZXT",   formFactors: ["ATX","mATX","ITX"], maxGpuLengthMm: 365, maxCoolerHeightMm: 180, hddBays: 2, radiatorMm: [240, 280, 360], price: 139, specs: [["Form","ATX / mATX / ITX"],["GPU max","365 mm"],["Cooler max","180 mm"],["3.5\" bays","2"],["Radiator","up to 360"]], desc: "Roomier successor to the H5 Flow." },
    { id: "case-h5-elite",  name: "NZXT H5 Elite",         brand: "NZXT",   formFactors: ["ATX","mATX","ITX"], maxGpuLengthMm: 365, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 119, specs: [["Form","ATX / mATX / ITX"],["GPU max","365 mm"],["Cooler max","170 mm"],["3.5\" bays","2"],["Radiator","up to 360"]], desc: "H5 Flow with upgraded mesh and lighting." },
    { id: "case-o11-dynamic",name:"Lian Li O11 Dynamic EVO",brand:"Lian Li",formFactors: ["ATX","mATX","ITX"], maxGpuLengthMm: 416, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 169, specs: [["Form","ATX / mATX / ITX"],["GPU max","416 mm"],["Cooler max","170 mm"],["3.5\" bays","2"],["Radiator","up to 360"]], desc: "Showcase dual-chamber case for water cooling." },
    { id: "case-sup01",     name: "Lian Li Sup01",         brand: "Lian Li",formFactors: ["mATX","ITX"], maxGpuLengthMm: 332, maxCoolerHeightMm: 165, hddBays: 2, radiatorMm: [240, 280], price: 129, specs: [["Form","micro-ATX / ITX"],["GPU max","332 mm"],["Cooler max","165 mm"],["3.5\" bays","2"],["Radiator","up to 280"]], desc: "Compact SFF case with flexible layouts." },
    { id: "case-nv5",       name: "Phanteks NV5",          brand: "Phanteks",formFactors:["mATX","ITX"], maxGpuLengthMm: 365, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 99,  specs: [["Form","micro-ATX / ITX"],["GPU max","365 mm"],["Cooler max","170 mm"],["3.5\" bays","2"],["Radiator","up to 360"]], desc: "Compact mesh case with good airflow." },
    { id: "case-xt-pro",    name: "Phanteks XT Pro Ultra", brand: "Phanteks",formFactors:["ATX","mATX","ITX"], maxGpuLengthMm: 420, maxCoolerHeightMm: 190, hddBays: 3, radiatorMm: [240, 280, 360], price: 159, specs: [["Form","ATX / mATX / ITX"],["GPU max","420 mm"],["Cooler max","190 mm"],["3.5\" bays","3"],["Radiator","up to 360"]], desc: "High-airflow tower for flagship parts." },
    { id: "case-td500",     name: "Cooler Master TD500 Mesh",brand:"Cooler Master",formFactors:["mATX","ITX"], maxGpuLengthMm: 397, maxCoolerHeightMm: 170, hddBays: 2, radiatorMm: [240, 280, 360], price: 89, specs: [["Form","micro-ATX / ITX"],["GPU max","397 mm"],["Cooler max","170 mm"],["3.5\" bays","2"],["Radiator","up to 360"]], desc: "Mesh-front compact case with strong value." },
    { id: "case-cosmos-c700l",name:"Cooler Master Cosmos C700L",brand:"Cooler Master",formFactors:["ATX","mATX","ITX"], maxGpuLengthMm: 420, maxCoolerHeightMm: 190, hddBays: 3, radiatorMm: [240, 280, 360], price: 199, specs: [["Form","ATX / mATX / ITX"],["GPU max","420 mm"],["Cooler max","190 mm"],["3.5\" bays","3"],["Radiator","up to 360"]], desc: "Premium tempered-glass showcase tower." },
  ],

  /* ---------- Cooling ---------- */
  cooling: [
    { id: "cool-se214",     name: "SE-214-XT",              brand: "ID-Cooling", kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 154, tdpRating: 180, price: 20, specs: [["Type","Air tower"],["Height","154 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~180 W"]], desc: "Cheapest adequate AM4/LGA air cooler." },
    { id: "cool-ak400",     name: "AK400",                  brand: "DeepCool", kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 155, tdpRating: 220, price: 29, specs: [["Type","Air tower"],["Height","155 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~220 W"]], desc: "Punches above its price for 65–95W chips." },
    { id: "cool-nhd15",     name: "NH-D15",                 brand: "Noctua",   kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 165, tdpRating: 250, price: 109, specs: [["Type","Dual-tower air"],["Height","165 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~250 W"],["Noise","6–24 dB"]], desc: "The gold standard air cooler." },
    { id: "cool-dk-4",      name: "Dark Rock Pro 4",        brand: "be quiet!",kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 168, tdpRating: 270, price: 89, specs: [["Type","Dual-tower air"],["Height","168 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~270 W"],["Noise","Quiet"]], desc: "Near-silent flagship air cooling." },
    { id: "cool-kraken-240",name: "Kraken 240",             brand: "NZXT",     kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 240, tdpRating: 280, price: 149, specs: [["Type","240mm AIO"],["Radiator","240 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~280 W"]], desc: "Compact liquid cooling; needs 240mm rad support." },
    { id: "cool-lf3-360",   name: "Liquid Freezer III 360", brand: "Arctic",   kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 360, tdpRating: 300, price: 129, specs: [["Type","360mm AIO"],["Radiator","360 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~300 W"]], desc: "Outstanding value 360mm AIO." },
    { id: "cool-se226",     name: "SE-226-XT",             brand: "ID-Cooling", kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 154, tdpRating: 190, price: 24, specs: [["Type","Dual-tower air"],["Height","154 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~190 W"]], desc: "Budget dual-tower cooler for 65–125W chips." },
    { id: "cool-frozn-a620",name: "Frozn A620",            brand: "ID-Cooling", kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 240, tdpRating: 250, price: 59, specs: [["Type","240mm AIO"],["Radiator","240 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~250 W"]], desc: "Compact liquid cooler for mainstream builds." },
    { id: "cool-ak620",     name: "AK620",                 brand: "DeepCool", kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 160, tdpRating: 260, price: 45, specs: [["Type","Dual-tower air"],["Height","160 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~260 W"]], desc: "Strong dual-tower air cooler for high-TDP chips." },
    { id: "cool-le360",     name: "LE360",                 brand: "DeepCool", kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 360, tdpRating: 280, price: 119, specs: [["Type","360mm AIO"],["Radiator","360 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~280 W"]], desc: "Efficient 360mm liquid cooler." },
    { id: "cool-nh-u12a",   name: "NH-U12A",               brand: "Noctua",   kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 158, tdpRating: 250, price: 89, specs: [["Type","Single-tower air"],["Height","158 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~250 W"],["Noise","Very quiet"]], desc: "Compact premium air cooler." },
    { id: "cool-nh-u14s",   name: "NH-U14S",               brand: "Noctua",   kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 165, tdpRating: 250, price: 139, specs: [["Type","Single-tower air"],["Height","165 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~250 W"],["Noise","Very quiet"]], desc: "Premium quiet cooler with strong static pressure." },
    { id: "cool-dark-rock-5",name:"Dark Rock 5",           brand: "be quiet!",kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 168, tdpRating: 270, price: 109, specs: [["Type","Dual-tower air"],["Height","168 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~270 W"],["Noise","Very quiet"]], desc: "Flagship silent air cooler." },
    { id: "cool-pure-loop-360",name:"Pure Loop 2 360",     brand: "be quiet!",kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 360, tdpRating: 300, price: 169, specs: [["Type","360mm AIO"],["Radiator","360 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~300 W"],["Noise","Very quiet"]], desc: "Silent flagship liquid cooler." },
    { id: "cool-kraken-280",name: "Kraken 280",            brand: "NZXT",     kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 280, tdpRating: 300, price: 169, specs: [["Type","280mm AIO"],["Radiator","280 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~300 W"]], desc: "Mid-size liquid cooler with strong cooling." },
    { id: "cool-kraken-360",name: "Kraken 360",            brand: "NZXT",     kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 360, tdpRating: 320, price: 199, specs: [["Type","360mm AIO"],["Radiator","360 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~320 W"]], desc: "Large liquid cooler for high-TDP builds." },
    { id: "cool-lf2-280",   name: "Liquid Freezer II 280", brand: "Arctic",   kind: "aio", sockets: ["AM4","AM5","LGA1700"], radiatorMm: 280, tdpRating: 280, price: 99, specs: [["Type","280mm AIO"],["Radiator","280 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~280 W"]], desc: "Great-value 280mm liquid cooler." },
    { id: "cool-freezer-36",name: "Freezer 36",            brand: "Arctic",   kind: "air", sockets: ["AM4","AM5","LGA1700"], heightMm: 154, tdpRating: 260, price: 39, specs: [["Type","Air tower"],["Height","154 mm"],["Sockets","AM4 / AM5 / LGA1700"],["Rated","~260 W"]], desc: "Budget air cooler with strong performance." },
  ],

  /* ---------- Monitor ---------- */
  monitor: [
    { id: "mon-asus-vg27aq3a", name: "TUF Gaming VG27AQ3A", brand: "ASUS",   price: 299, specs: [["Size","27-inch"],["Resolution","2560 × 1440"],["Refresh","180 Hz"],["Panel","Fast IPS"]], desc: "Fast 1440p gaming monitor with ELMB sync." },
    { id: "mon-asus-xg27uq",   name: "ROG Strix XG27UQ",    brand: "ASUS",   price: 799, specs: [["Size","27-inch"],["Resolution","3840 × 2160"],["Refresh","144 Hz"],["Panel","IPS"]], desc: "4K high-refresh monitor for HDR gaming." },
    { id: "mon-asus-pa279cv",  name: "ProArt PA279CV",      brand: "ASUS",   price: 449, specs: [["Size","27-inch"],["Resolution","3840 × 2160"],["Refresh","60 Hz"],["Panel","IPS"]], desc: "Color-accurate 4K monitor for creators." },
    { id: "mon-msi-274qrf",    name: "MAG 274QRF QD",        brand: "MSI",    price: 449, specs: [["Size","27-inch"],["Resolution","2560 × 1440"],["Refresh","360 Hz"],["Panel","Rapid IPS"]], desc: "Esports-grade 360Hz 1440p monitor." },
    { id: "mon-msi-321urx",    name: "MPG 321URX",          brand: "MSI",    price: 699, specs: [["Size","32-inch"],["Resolution","3840 × 2160"],["Refresh","144 Hz"],["Panel","IPS"]], desc: "Large 4K monitor for gaming and productivity." },
    { id: "mon-msi-mp273l",    name: "PRO MP273L E14",       brand: "MSI",    price: 199, specs: [["Size","27-inch"],["Resolution","2560 × 1440"],["Refresh","75 Hz"],["Panel","IPS"]], desc: "Affordable 1440p office and gaming monitor." },
    { id: "mon-gig-m27qp",     name: "M27Q P",               brand: "Gigabyte",price: 279, specs: [["Size","27-inch"],["Resolution","2560 × 1440"],["Refresh","165 Hz"],["Panel","SS IPS"]], desc: "Value 1440p gaming monitor." },
    { id: "mon-gig-m32u",      name: "M32U",                 brand: "Gigabyte",price: 649, specs: [["Size","32-inch"],["Resolution","3840 × 2160"],["Refresh","144 Hz"],["Panel","SS IPS"]], desc: "4K 144Hz monitor with HDMI 2.1." },
    { id: "mon-gig-mo27u2",    name: "MO27U2",               brand: "Gigabyte",price: 499, specs: [["Size","27-inch"],["Resolution","3840 × 2160"],["Refresh","160 Hz"],["Panel","IPS"]], desc: "Fast 4K monitor for console and PC." },
    { id: "mon-sam-g5-27",     name: "Odyssey G5 27\"",      brand: "Samsung",price: 249, specs: [["Size","27-inch"],["Resolution","2560 × 1440"],["Refresh","165 Hz"],["Panel","VA"]], desc: "Curved 1440p gaming monitor with HDR10." },
    { id: "mon-sam-g7-32",     name: "Odyssey G7 32\"",      brand: "Samsung",price: 599, specs: [["Size","32-inch"],["Resolution","2560 × 1440"],["Refresh","240 Hz"],["Panel","VA"]], desc: "Large 240Hz QHD monitor for immersive gaming." },
    { id: "mon-sam-m7-32",     name: "Smart Monitor M7 32\"",brand: "Samsung",price: 399, specs: [["Size","32-inch"],["Resolution","3840 × 2160"],["Refresh","60 Hz"],["Panel","IPS"]], desc: "Smart 4K monitor with streaming apps." },
  ],
};

// Category metadata: display label + which PARTS key it maps to.
// `key` differs from `id` only for cases (JS reserved word).
const CATEGORIES = [
  { id: "cpu",          label: "CPU",         key: "cpu" },
  { id: "gpu",          label: "Graphics Card",key:"gpu" },
  { id: "motherboard",  label: "Motherboard", key: "motherboard" },
  { id: "ram",          label: "Memory (RAM)",key: "ram" },
  { id: "storage",      label: "Storage",     key: "storage" },
  { id: "psu",          label: "Power Supply",key: "psu" },
  { id: "case",         label: "Case",        key: "caseItem" },
  { id: "cooling",      label: "Cooling",     key: "cooling" },
  { id: "monitor",      label: "Monitor",     key: "monitor" },
];
const catById = (id) => CATEGORIES.find((c) => c.id === id);
const allBrands = () => [...new Set(CATEGORIES.flatMap((c) => PARTS[c.key].map((p) => p.brand)))].sort();
const brandsForCategory = (catId) => {
  const cat = catById(catId);
  if (!cat) return [];
  return [...new Set(PARTS[cat.key].map((p) => p.brand))].sort();
};

const VIDEO_GUIDES = [
  {
    component: "Full PC build walkthrough",
    title: "How to Build a PC - Step-by-Step Guide",
    url: "https://www.youtube.com/watch?v=0fUhFAGNbkc",
    note: "One video covers most components — use the timestamps below.",
    timestamps: [
      { cat: "cpu", at: "3:22" },
      { cat: "ram", at: "5:41" },
      { cat: "storage", at: "7:25" },
      { cat: "cooling", at: "10:06" },
      { cat: "case", at: "26:55" },
      { cat: "motherboard", at: "27:25" },
      { cat: "psu", at: "43:42" },
      { cat: "gpu", at: "49:08" },
    ],
  },
  {
    component: "Monitor",
    title: "How to Setup A Monitor",
    url: "https://www.youtube.com/watch?v=L0U5ZaevF5U",
    note: "Connect the video cable, power the monitor, then pick the correct input.",
  },
];

/* ============================================================
   CURATED BUILDS (presets) — all verified compatible
   ============================================================ */
const PRESETS = [
  {
    id: "budget-500", name: "Budget Starter", budget: 500, tag: "1080p Gaming",
    desc: "Esports-ready 1080p machine. Upgrade path via AM4 socket.",
    perf: "60 fps @ 1080p High",
    parts: {
      cpu: "cpu-r5-5600", gpu: "gpu-rx-7600", motherboard: "mb-b550-aorus",
      ram: "ram-16-ddr4", storage: "ssd-p3-1tb", psu: "psu-evga-500",
      case: "case-pop-air", cooling: "cool-ak400",
    },
  },
  {
    id: "midrange-800", name: "Mid-Range Gaming", budget: 800, tag: "1440p Gaming",
    desc: "The sweet spot: modern AM5 platform, fast DDR5, 1440p-capable GPU.",
    perf: "100+ fps @ 1440p High",
    parts: {
      cpu: "cpu-r5-7600", gpu: "gpu-rtx-4060", motherboard: "mb-b650m-mortar",
      ram: "ram-32-ddr5", storage: "ssd-sn850x-1tb", psu: "psu-rm750e",
      case: "case-h5-flow", cooling: "cool-ak400",
    },
  },
  {
    id: "highend-1800", name: "High-End Gaming", budget: 1800, tag: "4K Gaming",
    desc: "3D V-Cache monster CPU + RTX 4070S. Built for max fps at 1440p/4K.",
    perf: "140+ fps @ 1440p Ultra / 80+ fps @ 4K",
    parts: {
      cpu: "cpu-7800x3d", gpu: "gpu-rtx-4070s", motherboard: "mb-b650e-f",
      ram: "ram-64-ddr5", storage: "ssd-990pro-2tb", psu: "psu-gx-850",
      case: "case-p400a", cooling: "cool-lf3-360",
    },
  },
  {
    id: "workstation", name: "Productivity / Workstation", budget: 1500, tag: "Content Creation",
    desc: "20-core Intel chip, 64GB RAM, fast NVMe — for video, 3D, and VMs.",
    perf: "Heavy multitasking & rendering",
    parts: {
      cpu: "cpu-i7-14700k", gpu: "gpu-arc-a750", motherboard: "mb-z790-e",
      ram: "ram-64-ddr5-z5", storage: "ssd-990pro-2tb", psu: "psu-bq-1000",
      case: "case-lancool-216", cooling: "cool-nhd15",
    },
  },
  {
    id: "itx-compact", name: "Compact ITX", budget: 1200, tag: "Small Form Factor",
    desc: "Full-power AM5 build in a shoebox-sized NR200P chassis.",
    perf: "100+ fps @ 1440p in a tiny case",
    parts: {
      cpu: "cpu-r5-7600", gpu: "gpu-rtx-4060", motherboard: "mb-b650e-i",
      ram: "ram-32-ddr5", storage: "ssd-sn850x-1tb", psu: "psu-rm750e",
      case: "case-nr200p", cooling: "cool-ak400",
    },
  },
];

/* ============================================================
   STATE
   ============================================================ */
const LS_KEY = "pcb-build-v1";
const LS_CURRENCY_KEY = "pcb-currency-v1";
const state = {
  selected: {},            // { cpu: partId, gpu: partId, ... }
  category: "cpu",         // active category tab
  search: "",
  brand: "",
  currency: "USD",         // display currency for prices
  partStatus: {},          // cached per-part compat status for card badges
};
let lastRecommendation = null;

const partById = (id) => {
  for (const cat of CATEGORIES) {
    const hit = PARTS[cat.key].find((p) => p.id === id);
    if (hit) return hit;
  }
  return null;
};

const loadState = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) state.selected = { ...JSON.parse(raw) };
  } catch (e) { /* corrupted storage — start fresh */ }

  // URL share link overrides saved state, e.g. #build=cpu:cpu-r5-7600,gpu:gpu-rtx-4060
  const hash = location.hash.match(/build=([^&]+)/);
  if (hash) {
    state.selected = {};
    hash[1].split(",").forEach((pair) => {
      const [cat, id] = pair.split(":");
      if (catById(cat) && partById(id)) state.selected[cat] = id;
    });
  }
  saveState();
};

const saveState = () => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.selected)); } catch (e) {}
};

const loadCurrency = () => {
  try {
    const saved = localStorage.getItem(LS_CURRENCY_KEY);
    if (CURRENCIES[saved]) state.currency = saved;
  } catch (e) {}
  const select = document.getElementById("currencySelect");
  if (select) select.value = state.currency;
};

const saveCurrency = () => {
  try { localStorage.setItem(LS_CURRENCY_KEY, state.currency); } catch (e) {}
};

/* ============================================================
   COMPATIBILITY ENGINE
   ------------------------------------------------------------
   Returns an array of results:
     { level: "ok"|"warn"|"bad", icon, text, fixCat? }
   `fixCat` (when present) renders a "Browse <category>" button
   that jumps the user to that category to swap the offending part.
   ============================================================ */
function runCompatibility() {
  const results = [];
  const sel = state.selected;
  const get = (cat) => (sel[cat] ? partById(sel[cat]) : null);

  const cpu = get("cpu"), gpu = get("gpu"), mb = get("motherboard"),
        ram = get("ram"), st = get("storage"), psu = get("psu"),
        cs = get("case"), cool = get("cooling");

  const filled = CATEGORIES.filter((c) => sel[c.id]).length;
  if (filled === 0) return results;

  /* ----- CPU ↔ Motherboard socket ----- */
  if (cpu && mb) {
    if (cpu.socket === mb.socket) {
      results.push({ level: "ok", icon: "✅", text: `CPU socket ${cpu.socket} matches motherboard.` });
    } else {
      results.push({ level: "bad", icon: "❌", text: `Socket mismatch: ${cpu.name} is ${cpu.socket} but ${mb.name} uses ${mb.socket}.`, fixCat: "cpu" });
      results.push({ level: "bad", icon: "❌", text: `Alternatively, swap the motherboard for a ${cpu.socket} board.`, fixCat: "motherboard" });
    }
  } else {
    results.push({ level: "warn", icon: "⚠️", text: "Select a CPU and motherboard to verify socket compatibility." });
  }

  /* ----- RAM ↔ Motherboard type & slots ----- */
  if (ram && mb) {
    if (ram.type === mb.ramType) {
      results.push({ level: "ok", icon: "✅", text: `${ram.type} RAM matches the motherboard.` });
      if (ram.modules > mb.ramSlots) {
        results.push({ level: "bad", icon: "❌", text: `${ram.name} has ${ram.modules} sticks but ${mb.name} only has ${mb.ramSlots} slots.`, fixCat: "ram" });
      } else if (ram.modules === mb.ramSlots) {
        results.push({ level: "warn", icon: "⚠️", text: `All ${mb.ramSlots} RAM slots will be used — no room to expand later.` });
      }
    } else {
      results.push({ level: "bad", icon: "❌", text: `Memory mismatch: ${ram.name} is ${ram.type} but ${mb.name} requires ${mb.ramType}.`, fixCat: "ram" });
    }
  }

  /* ----- Motherboard form factor ↔ Case ----- */
  if (mb && cs) {
    if (cs.formFactors.includes(mb.formFactor)) {
      results.push({ level: "ok", icon: "✅", text: `${mb.formFactor} motherboard fits the case.` });
    } else {
      results.push({ level: "bad", icon: "❌", text: `${mb.name} is ${mb.formFactor} but ${cs.name} only supports ${cs.formFactors.join(" / ")}.`, fixCat: "motherboard" });
      results.push({ level: "bad", icon: "❌", text: `Or choose a case that supports ${mb.formFactor}.`, fixCat: "case" });
    }
  }

  /* ----- GPU length ↔ Case clearance ----- */
  if (gpu && cs) {
    if (gpu.lengthMm <= cs.maxGpuLengthMm) {
      results.push({ level: "ok", icon: "✅", text: `GPU (${gpu.lengthMm} mm) fits within the case's ${cs.maxGpuLengthMm} mm limit.` });
    } else {
      results.push({ level: "bad", icon: "❌", text: `${gpu.name} is ${gpu.lengthMm} mm — too long for ${cs.name} (max ${cs.maxGpuLengthMm} mm).`, fixCat: "case" });
    }
  }

  /* ----- Cooler ↔ CPU socket & case height ----- */
  if (cool && cpu) {
    if (cool.kind === "air") {
      if (cool.sockets.includes(cpu.socket)) {
        results.push({ level: "ok", icon: "✅", text: `${cool.name} supports the ${cpu.socket} socket.` });
      } else {
        results.push({ level: "bad", icon: "❌", text: `${cool.name} does not list ${cpu.socket} socket support.`, fixCat: "cooling" });
      }
      if (cpu.tdp > cool.tdpRating) {
        results.push({ level: "warn", icon: "⚠️", text: `${cpu.name} (${cpu.tdp} W) exceeds ${cool.name}'s ~${cool.tdpRating} W rating — expect high temps.` });
      }
    } else if (cool.kind === "aio") {
      if (cool.sockets.includes(cpu.socket)) {
        results.push({ level: "ok", icon: "✅", text: `${cool.name} supports the ${cpu.socket} socket.` });
      } else {
        results.push({ level: "bad", icon: "❌", text: `${cool.name} does not list ${cpu.socket} socket support.`, fixCat: "cooling" });
      }
    }
  }
  if (cool && cs) {
    if (cool.kind === "air" && cool.heightMm <= cs.maxCoolerHeightMm) {
      results.push({ level: "ok", icon: "✅", text: `Cooler height (${cool.heightMm} mm) fits the case (${cs.maxCoolerHeightMm} mm max).` });
    } else if (cool.kind === "air") {
      results.push({ level: "bad", icon: "❌", text: `${cool.name} is ${cool.heightMm} mm tall — exceeds ${cs.name}'s ${cs.maxCoolerHeightMm} mm limit.`, fixCat: "cooling" });
    }
    if (cool.kind === "aio" && cs.radiatorMm && !cs.radiatorMm.includes(cool.radiatorMm)) {
      results.push({ level: "bad", icon: "❌", text: `${cs.name} has no ${cool.radiatorMm} mm radiator mount for ${cool.name}.`, fixCat: "cooling" });
    } else if (cool.kind === "aio") {
      results.push({ level: "ok", icon: "✅", text: `Case supports the ${cool.radiatorMm} mm radiator.` });
    }
  }

  /* ----- Storage ↔ Motherboard / Case ----- */
  if (st && mb) {
    if (st.interface === "NVMe") {
      if (mb.m2Slots > 0) {
        results.push({ level: "ok", icon: "✅", text: `${st.name} uses an M.2 slot (${mb.m2Slots} available).` });
      } else {
        results.push({ level: "bad", icon: "❌", text: `${mb.name} has no M.2 slots for ${st.name}.`, fixCat: "motherboard" });
      }
    } else {
      results.push({ level: "ok", icon: "✅", text: `${st.name} uses SATA — supported by all listed motherboards.` });
    }
  }
  if (st && cs && st.formFactor === "3.5\"") {
    if (cs.hddBays > 0) {
      results.push({ level: "ok", icon: "✅", text: `Case has ${cs.hddBays}× 3.5" bay${cs.hddBays > 1 ? "s" : ""} for the HDD.` });
    } else {
      results.push({ level: "bad", icon: "❌", text: `${cs.name} has no 3.5" drive bays for ${st.name}.`, fixCat: "storage" });
    }
  }
  if (st && cs && st.formFactor === "2.5\"" && cs.hddBays === 0) {
    results.push({ level: "warn", icon: "⚠️", text: `${cs.name} lists no 3.5" bays — verify it has 2.5" SSD mounts.` });
  }

  /* ----- PSU wattage estimate ----- */
  if (psu && cpu && gpu) {
    const load = cpu.tdp + gpu.tdp + SYSTEM_OVERHEAD_W;
    const required = Math.ceil(load * PSU_HEADROOM);
    if (psu.wattage >= required) {
      results.push({ level: "ok", icon: "✅", text: `Estimated load ~${load} W — ${psu.name} (${psu.wattage} W) gives healthy headroom.` });
    } else if (psu.wattage >= load) {
      results.push({ level: "warn", icon: "⚠️", text: `Estimated load ~${load} W vs ${psu.wattage} W PSU — works, but little headroom for upgrades.` });
    } else {
      results.push({ level: "bad", icon: "❌", text: `Insufficient power: estimated load ~${load} W exceeds ${psu.name}'s ${psu.wattage} W. Need ~${required} W+.`, fixCat: "psu" });
    }
    if (psu.efficiency === "Bronze") {
      results.push({ level: "warn", icon: "⚠️", text: `${psu.name} is only 80+ Bronze — consider Gold or better for efficiency.` });
    }
  } else if (psu && (!cpu || !gpu)) {
    results.push({ level: "warn", icon: "⚠️", text: "Add a CPU and GPU to verify PSU wattage." });
  }

  /* ----- CPU without iGPU and no GPU selected ----- */
  if (cpu && !gpu && /^(cpu-r5-5600)$|12400f|13400f|14400f|7500f|5800x3d|7800x3d/.test(cpu.id)) {
    results.push({ level: "bad", icon: "❌", text: `${cpu.name} has no integrated graphics — a graphics card is required.`, fixCat: "gpu" });
  }

  /* ----- Completion summary ----- */
  if (filled === CATEGORIES.length) {
    const worst = results.some((r) => r.level === "bad") ? "bad"
               : results.some((r) => r.level === "warn") ? "warn" : "ok";
    if (worst === "ok") {
      results.unshift({ level: "ok", icon: "✅", text: "All compatibility checks passed — this build looks great!" });
    }
  }

  return results;
}

const overallStatus = (results) => {
  if (results.some((r) => r.level === "bad")) return "bad";
  if (results.some((r) => r.level === "warn")) return "warn";
  if (results.length) return "ok";
  return "empty";
};

/* ============================================================
   RENDERING — category tabs
   ============================================================ */
function renderTabs() {
  const tabs = document.getElementById("categoryTabs");
  tabs.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "cat-tab" + (cat.id === state.category ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", cat.id === state.category);
    const count = state.selected[cat.id] ? 1 : 0;
    btn.innerHTML = `${cat.label}${count ? `<span class="cat-count">✓</span>` : ""}`;
    btn.addEventListener("click", () => {
      state.category = cat.id;
      renderTabs();
      renderGrid();
    });
    tabs.appendChild(btn);
  });
  renderBrandFilter();
}

/* ============================================================
   RENDERING — component cards
   ============================================================ */
function filteredParts() {
  const cat = catById(state.category);
  const q = state.search.trim().toLowerCase();
  return PARTS[cat.key].filter((p) => {
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.specs.some(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
    const matchBrand = !state.brand || p.brand === state.brand;
    return matchSearch && matchBrand;
  });
}

function renderGrid() {
  const grid = document.getElementById("componentGrid");
  const noRes = document.getElementById("noResults");
  grid.innerHTML = "";

  const parts = filteredParts();
  noRes.hidden = parts.length > 0;

  parts.forEach((p) => {
    const isSel = state.selected[state.category] === p.id;

    const card = document.createElement("article");
    card.className = "part-card" + (isSel ? " selected" : "");
    card.setAttribute("role", "listitem");

    const specsHtml = p.specs
      .map(([k, v]) => `<li><span class="spec-k">${k}</span><span class="spec-v">${v}</span></li>`)
      .join("");

    card.innerHTML = `
      <div class="part-top">
        <span class="part-brand">${p.brand}</span>
        <span class="part-price">${money(p.price)}</span>
      </div>
      <h3 class="part-name">${p.name}</h3>
      <ul class="spec-list">${specsHtml}</ul>
      <p style="font-size:0.8rem;color:var(--text-muted);margin:0">${p.desc || ""}</p>
      <div class="part-actions">
        <button class="btn ${isSel ? "btn-ghost" : "btn-primary"}" data-action="select">
          ${isSel ? "✓ Selected" : "Select"}
        </button>
        <a class="btn btn-buy" href="${buyUrl(p)}" target="_blank" rel="noopener noreferrer"
           aria-label="Search ${p.brand} ${p.name} on Shopee">Shopee</a>
      </div>`;

    card.querySelector('[data-action="select"]').addEventListener("click", () => {
      if (state.selected[state.category] === p.id) {
        delete state.selected[state.category];
      } else {
        state.selected[state.category] = p.id;
      }
      saveState();
      refreshAfterSelection();
    });

    grid.appendChild(card);
  });
}

/* ============================================================
   RENDERING — compatibility panel + build list
   ============================================================ */
function refreshAfterSelection() {
  renderGrid();
  renderTabs();
  renderAlerts();
  renderBuildList();
  renderHeaderTotal();
}

function renderAlerts() {
  const results = runCompatibility();
  const statusEl = document.getElementById("compatStatus");
  const listEl = document.getElementById("alertList");
  const level = overallStatus(results);

  const labels = {
    ok: "✅ Compatible", warn: "⚠️ Caution", bad: "❌ Incompatible", empty: "Select parts to check",
  };
  statusEl.innerHTML = `<span class="compat-badge compat-${level === "empty" ? "empty" : level}">${labels[level]}</span>`;

  listEl.innerHTML = "";
  results.forEach((r) => {
    const li = document.createElement("li");
    li.className = `alert-item ${r.level}`;
    li.innerHTML = `
      <span class="alert-icon">${r.icon}</span>
      <span class="alert-text">${r.text}</span>
      ${r.fixCat ? `<span class="alert-actions"><button class="btn btn-small btn-ghost" data-fix="${r.fixCat}">Browse</button></span>` : ""}`;
    const fixBtn = li.querySelector("[data-fix]");
    if (fixBtn) {
      fixBtn.addEventListener("click", () => {
        state.category = r.fixCat;
        renderTabs();
        renderGrid();
        document.getElementById("categoryTabs").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    listEl.appendChild(li);
  });
}

function renderBuildList() {
  const list = document.getElementById("buildList");
  const totalEl = document.getElementById("buildTotal");
  list.innerHTML = "";

  let total = 0;
  CATEGORIES.forEach((cat) => {
    const id = state.selected[cat.id];
    if (!id) return;
    const p = partById(id);
    if (!p) return;
    total += p.price;

    const li = document.createElement("li");
    li.className = "build-row";
    li.innerHTML = `
      <div>
        <div class="build-cat">${cat.label}</div>
        <div class="build-name">${p.name}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.45rem">
        <span class="build-price">${money(p.price)}</span>
        <a class="build-buy" href="${buyUrl(p)}" target="_blank" rel="noopener noreferrer"
           aria-label="Search ${p.brand} ${p.name} on Shopee">Shopee</a>
        <button class="remove-btn" data-remove="${cat.id}" aria-label="Remove ${p.name}">&times;</button>
      </div>`;
    li.querySelector("[data-remove]").addEventListener("click", () => {
      delete state.selected[cat.id];
      saveState();
      refreshAfterSelection();
    });
    list.appendChild(li);
  });

  if (!list.children.length) {
    list.innerHTML = `<li class="build-empty">No parts selected yet. Pick components from the browser.</li>`;
  }
  totalEl.textContent = money(total);
}

function renderHeaderTotal() {
  const totalEl = document.getElementById("headerTotal");
  const countEl = document.getElementById("headerCount");
  let total = 0, count = 0;
  CATEGORIES.forEach((cat) => {
    const id = state.selected[cat.id];
    if (id) { const p = partById(id); if (p) { total += p.price; count++; } }
  });
  totalEl.textContent = money(total);
  countEl.textContent = `${count}/${CATEGORIES.length}`;
}

/* ============================================================
   BUILD SUMMARY OVERLAY
   ============================================================ */
function openSummary() {
  const body = document.getElementById("summaryBody");
  const overlay = document.getElementById("summaryOverlay");
  body.innerHTML = "";

  let total = 0;
  CATEGORIES.forEach((cat) => {
    const id = state.selected[cat.id];
    if (!id) return;
    const p = partById(id);
    if (!p) return;
    total += p.price;
    const row = document.createElement("div");
    row.className = "build-row";
    row.innerHTML = `
      <div>
        <div class="build-cat">${cat.label}</div>
        <div class="build-name">${p.name}</div>
      </div>
      <div style="text-align:right">
        <div class="build-price">${money(p.price)}</div>
        <a class="btn btn-buy btn-small" href="${buyUrl(p)}" target="_blank" rel="noopener noreferrer"
           aria-label="Search ${p.brand} ${p.name} on Shopee">Shopee</a>
      </div>`;
    body.appendChild(row);
  });

  if (!body.children.length) {
    body.innerHTML = `<p class="build-empty">Your build is empty. Add parts on the Builder tab.</p>`;
  } else {
    const totalRow = document.createElement("div");
    totalRow.className = "build-total-row";
    totalRow.innerHTML = `<span>Total</span><strong>${money(total)}</strong>`;
    body.appendChild(totalRow);

    const shareBtn = document.createElement("button");
    shareBtn.className = "btn btn-primary";
    shareBtn.style.marginTop = "0.75rem";
    shareBtn.textContent = "Copy Share Link";
    shareBtn.addEventListener("click", copyShareLink);
    body.appendChild(shareBtn);
  }

  overlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSummary() {
  document.getElementById("summaryOverlay").hidden = true;
  document.body.style.overflow = "";
}

/* ============================================================
   SHARE LINK
   ============================================================ */
function buildShareUrl() {
  const pairs = CATEGORIES
    .filter((c) => state.selected[c.id])
    .map((c) => `${c.id}:${state.selected[c.id]}`)
    .join(",");
  return `${location.origin}${location.pathname}#build=${pairs}`;
}

function copyShareLink() {
  const url = buildShareUrl();
  const done = () => toast("Share link copied!");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
  } else {
    fallbackCopy(url, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed — link: " + text); }
  document.body.removeChild(ta);
}

function printBuildSpec() {
  const area = document.getElementById("printArea");
  if (!area) return;
  const currency = CURRENCIES[state.currency] || CURRENCIES.USD;
  let total = 0;
  const partsHtml = CATEGORIES.map((cat) => {
    const id = state.selected[cat.id];
    if (!id) return "";
    const p = partById(id);
    if (!p) return "";
    total += p.price;
    const specs = (p.specs || []).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join("");
    return `<section class="print-part"><h2>${cat.label} — ${p.name}</h2><p class="print-meta">${p.brand} • ${money(p.price)}</p><ul>${specs}</ul></section>`;
  }).join("");

  area.innerHTML = partsHtml ? `
    <h1>PC Build Spec Sheet</h1>
    <p class="print-sub">Generated ${new Date().toLocaleString()} • Currency: ${currency.label} • Total: <strong>${money(total)}</strong></p>
    <p class="print-sub">Share link: ${buildShareUrl()}</p>
    ${partsHtml}
    <p class="print-note">Prices are placeholders; currency conversion uses approximate rates.</p>
  ` : `<h1>PC Build Spec Sheet</h1><p>No parts selected yet.</p>`;

  const cleanup = () => document.body.classList.remove("printing");
  window.addEventListener("afterprint", cleanup, { once: true });
  document.body.classList.add("printing");
  window.print();
  setTimeout(cleanup, 2000);
}

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ============================================================
   RECOMMENDATIONS — presets + custom generator
   ============================================================ */
function renderBudgetOptions() {
  const select = document.getElementById("recoBudget");
  if (!select) return;
  const current = select.value;
  [...select.options].forEach((opt) => {
    const value = Number(opt.value);
    opt.textContent = `Up to ${money(value)}${value === 2500 ? "+" : ""}`;
  });
  select.value = current;
}

function renderPresets() {
  const wrap = document.getElementById("buildCards");
  wrap.innerHTML = "";
  PRESETS.forEach((preset) => {
    const total = Object.values(preset.parts).reduce((s, id) => s + (partById(id)?.price || 0), 0);
    const card = document.createElement("article");
    card.className = "preset-card";
    card.innerHTML = `
      <span class="preset-tag">~${money(preset.budget)} · ${preset.tag}</span>
      <h3>${preset.name}</h3>
      <p class="preset-desc">${preset.desc}</p>
      <div class="preset-meta"><span>Est. performance</span><strong>${preset.perf}</strong></div>
      <div class="preset-meta"><span>Total</span><strong>${money(total)}</strong></div>
      <div class="preset-parts">${CATEGORIES.map((c) => partById(preset.parts[c.id])?.name).filter(Boolean).join(" · ")}</div>
      <button class="btn btn-success" data-load="${preset.id}">Load This Build</button>`;
    card.querySelector("[data-load]").addEventListener("click", () => {
      state.selected = { ...preset.parts };
      saveState();
      refreshAll();
      switchView("builder");
      toast(`Loaded "${preset.name}" — review compatibility in the panel.`);
    });
    wrap.appendChild(card);
  });
}

/*
 * Custom recommendation generator.
 * Strategy: pick a platform (socket) from use-case + budget, then
 * for each category choose the part closest to that category's
 * budget share, optionally restricted to a preferred brand.
 * Finally runs the real compatibility engine so warnings are honest.
 */
function generateRecommendation(use, budget, brandPref) {
  const pick = (catKey, targetPrice, extraFilter = () => true) => {
    const candidates = PARTS[catKey].filter(extraFilter);
    // If a brand is preferred and at least one candidate matches, restrict to it.
    const branded = brandPref ? candidates.filter((p) => p.brand === brandPref) : [];
    const pool = branded.length ? branded : candidates;
    if (!pool.length) return null;
    return pool.reduce((best, p) =>
      Math.abs(p.price - targetPrice) < Math.abs(best.price - targetPrice) ? p : best
    );
  };

  // Platform choice: budget gaming favors AM4/AM5; productivity favors LGA1700.
  let socket;
  if (budget <= 550) socket = "AM4";
  else if (use === "productivity" && budget >= 1200) socket = "LGA1700";
  else socket = "AM5";
  const ramType = socket === "AM4" ? "DDR4" : "DDR5";

  // Budget allocation (fractions of total budget per category).
  const alloc = { cpu: 0.22, gpu: 0.30, motherboard: 0.10, ram: 0.08, storage: 0.07, psu: 0.06, case: 0.07, cooling: 0.03, monitor: 0.07 };
  const chosen = {};

  // CPU first — it constrains the socket.
  const cpu = pick("cpu", budget * alloc.cpu, (p) => p.socket === socket);
  if (!cpu) return null;
  chosen.cpu = cpu.id;

  // Motherboard must match socket; prefer ATX/mATX unless ITX budget build.
  const mb = pick("motherboard", budget * alloc.motherboard,
    (p) => p.socket === socket);
  if (!mb) return null;
  chosen.motherboard = mb.id;

  const ram = pick("ram", budget * alloc.ram, (p) => p.type === ramType && p.modules <= mb.ramSlots);
  if (!ram) return null;
  chosen.ram = ram.id;

  const gpu = pick("gpu", budget * alloc.gpu);
  const storage = pick("storage", budget * alloc.storage, (p) => p.formFactor !== "3.5\"");
  const psu = pick("psu", budget * alloc.psu);
  const cs = pick("caseItem", budget * alloc.case, (p) => p.formFactors.includes(mb.formFactor));
  const cool = pick("cooling", budget * alloc.cooling, (p) =>
    p.kind === "aio" ? true : p.sockets.includes(socket));
  const mon = pick("monitor", budget * alloc.monitor);
  if (!gpu || !storage || !psu || !cs || !cool || !mon) return null;

  chosen.gpu = gpu.id; chosen.storage = storage.id; chosen.psu = psu.id;
  chosen.case = cs.id; chosen.cooling = cool.id; chosen.monitor = mon.id;

  return chosen;
}

function renderRecoResult(parts) {
  lastRecommendation = parts;
  const box = document.getElementById("recoResult");
  box.hidden = false;
  let total = 0;
  const rows = CATEGORIES.map((cat) => {
    const p = partById(parts[cat.id]);
    if (!p) return "";
    total += p.price;
    return `<li><strong>${cat.label}:</strong> ${p.name} — ${money(p.price)}</li>`;
  }).join("");

  box.innerHTML = `
    <h3>Your Recommended Build</h3>
    <p class="reco-total">Estimated total: ${money(total)}</p>
    <ul class="reco-parts">${rows}</ul>
    <p style="font-size:0.85rem">Estimated performance: ${perfEstimate(parts)}</p>
    <button class="btn btn-primary" id="loadReco" style="margin-top:0.6rem">Load into Builder</button>`;

  document.getElementById("loadReco").addEventListener("click", () => {
    state.selected = { ...parts };
    saveState();
    refreshAll();
    switchView("builder");
    toast("Recommendation loaded — check the compatibility panel.");
  });

  // Surface any warnings honestly (without disturbing the user's build).
  const prevSelected = state.selected;
  state.selected = { ...parts };
  const results = runCompatibility();
  state.selected = prevSelected;
  const warns = results.filter((r) => r.level !== "ok");
  if (warns.length) {
    const w = document.createElement("p");
    w.style.cssText = "font-size:0.85rem;color:var(--warn);margin-top:0.6rem";
    w.textContent = "Heads up: " + warns.slice(0, 2).map((r) => r.text).join(" ");
    box.appendChild(w);
  }
}

function perfEstimate(parts) {
  const gpu = partById(parts.gpu);
  const price = CATEGORIES
    .filter((c) => c.id !== "monitor")
    .reduce((s, c) => s + (partById(parts[c.id])?.price || 0), 0);
  if (!gpu) return "—";
  if (price < 650) return "1080p High @ 60+ fps";
  if (price < 1100) return "1440p High @ 80+ fps";
  if (price < 1600) return "1440p Ultra / 4K Medium @ 60+ fps";
  return "4K Ultra @ 60+ fps";
}

/* ============================================================
   VIEW SWITCHING + FILTERS + WIRING
   ============================================================ */
function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const ytTimestamp = (url, ts) => {
  const sec = ts.split(":").map(Number).reduce((a, n) => a * 60 + n, 0);
  return `${url}&t=${sec}`;
};

function renderVideos() {
  const wrap = document.getElementById("videoGuides");
  if (!wrap) return;
  wrap.innerHTML = "";
  VIDEO_GUIDES.forEach((g) => {
    const card = document.createElement("article");
    card.className = "guide-card video-card";
    const tsHtml = g.timestamps
      ? `<div class="video-ts">${g.timestamps.map((x) => {
          const label = catById(x.cat)?.label || x.cat;
          return `<a href="${ytTimestamp(g.url, x.at)}" target="_blank" rel="noopener noreferrer">${x.at} — ${label}</a>`;
        }).join("")}</div>`
      : "";
    card.innerHTML = `
      <h3>${g.component}</h3>
      <p><strong>${g.title}</strong></p>
      <p class="video-note">${g.note}</p>
      <a class="btn btn-buy" href="${g.url}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
      ${tsHtml}`;
    wrap.appendChild(card);
  });
}

function populateBrandFilters() {
  const sel = document.getElementById("recoBrand");
  if (!sel) return;
  allBrands().forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b; opt.textContent = b;
    sel.appendChild(opt);
  });
}

function renderBrandFilter() {
  const sel = document.getElementById("brandFilter");
  if (!sel) return;
  const brands = brandsForCategory(state.category);
  if (state.brand && !brands.includes(state.brand)) state.brand = "";
  sel.innerHTML = `<option value="">All brands</option>` +
    brands.map((b) => `<option value="${b}"${b === state.brand ? " selected" : ""}>${b}</option>`).join("");
  sel.value = state.brand;
}

function refreshAll() {
  renderTabs();
  renderGrid();
  renderAlerts();
  renderBuildList();
  renderHeaderTotal();
  renderBudgetOptions();
  renderPresets();
}

/* ============================================================
   SOUND FX — lightweight WebAudio hover/click feedback
   ============================================================ */
const SOUND_SELECTOR = "button, a.btn, a.build-buy, a.state-link";
let audioCtx = null;
let lastHoverEl = null;
let uiSoundOn = true;

const audio = () => {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
};

const tone = ({ freq = 440, endFreq = null, duration = 0.06, type = "sine", volume = 0.025, delay = 0 }) => {
  if (!uiSoundOn) return;
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
};

const playHoverSound = () => tone({ freq: 660, endFreq: 880, duration: 0.045, type: "sine", volume: 0.03 });
const playClickSound = () => {
  tone({ freq: 220, endFreq: 140, duration: 0.07, type: "triangle", volume: 0.065 });
  tone({ freq: 520, endFreq: 760, duration: 0.05, type: "sine", volume: 0.04, delay: 0.015 });
};

const updateSoundToggles = () => {
  document.querySelectorAll(".sound-toggle").forEach((b) => {
    b.classList.toggle("is-muted", !uiSoundOn);
    b.setAttribute("aria-pressed", String(uiSoundOn));
  });
};
const toggleUiSound = () => {
  uiSoundOn = !uiSoundOn;
  updateSoundToggles();
};
updateSoundToggles();

document.addEventListener("pointerover", (e) => {
  const el = e.target.closest?.(SOUND_SELECTOR);
  if (!el) { lastHoverEl = null; return; }
  if (el === lastHoverEl) return;
  lastHoverEl = el;
  playHoverSound();
});
document.addEventListener("pointerout", (e) => {
  const el = e.target.closest?.(SOUND_SELECTOR);
  if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) lastHoverEl = null;
});
document.addEventListener("click", (e) => {
  if (e.target.closest?.(SOUND_SELECTOR)) playClickSound();
});

/* ============================================================
   SKY AI — Gemini-powered assistant
   ============================================================ */
let skyAiHistory = [];
let skyAiBusy = false;
const skyAiEl = (id) => document.getElementById(id);
const skyAiScroll = () => {
  const m = skyAiEl("skyAiMessages");
  if (m) m.scrollTop = m.scrollHeight;
};
const skyAiAddMessage = (role, text) => {
  const box = skyAiEl("skyAiMessages");
  if (!box) return null;
  const div = document.createElement("div");
  div.className = `sky-ai-msg ${role}`;
  div.textContent = text;
  box.appendChild(div);
  skyAiScroll();
  return div;
};
const setSkyAiOpen = (open) => {
  const panel = skyAiEl("skyAiPanel");
  const fab = skyAiEl("skyAiFab");
  if (!panel) return;
  panel.hidden = !open;
  if (fab) fab.setAttribute("aria-expanded", String(open));
  if (open) {
    const box = skyAiEl("skyAiMessages");
    if (box && box.children.length === 0) {
      skyAiAddMessage("assistant", "Hi! I'm Sky AI. Ask me anything about PC building, compatibility, parts, budgets, or Malaysian shopping.");
    }
    skyAiEl("skyAiInput")?.focus();
  }
};
const toggleSkyAi = () => {
  const panel = skyAiEl("skyAiPanel");
  if (panel) setSkyAiOpen(panel.hidden);
};
const skyAiSetBusy = (busy) => {
  skyAiBusy = busy;
  const send = skyAiEl("skyAiSend");
  const input = skyAiEl("skyAiInput");
  if (send) send.disabled = busy;
  if (input) input.disabled = busy;
};
async function skyAiAsk(question) {
  const q = (question || "").trim();
  if (!q || skyAiBusy) return;
  const input = skyAiEl("skyAiInput");
  if (input) input.value = "";
  if (!GEMINI_API_KEY) {
    skyAiAddMessage("assistant", "Sky AI needs a Gemini API key. Add GEMINI_API_KEY in script.js, then reload.");
    return;
  }
  skyAiAddMessage("user", q);
  skyAiHistory.push({ role: "user", text: q });
  skyAiSetBusy(true);
  tone({ freq: 520, endFreq: 700, duration: 0.06, type: "sine", volume: 0.03 });
  const thinking = skyAiAddMessage("assistant", "…");
  try {
    const contents = skyAiHistory.slice(-12).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SKY_AI_SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "Sorry, I couldn't get a response.";
    if (thinking) thinking.textContent = text;
    skyAiHistory.push({ role: "assistant", text });
    tone({ freq: 880, endFreq: 1180, duration: 0.08, type: "sine", volume: 0.035 });
  } catch (err) {
    if (thinking) thinking.textContent = "Sorry, Sky AI couldn't reach Gemini. Check GEMINI_API_KEY and GEMINI_MODEL.";
  } finally {
    skyAiSetBusy(false);
    skyAiEl("skyAiInput")?.focus();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  loadCurrency();
  populateBrandFilters();
  renderVideos();
  refreshAll();

  // Sky AI + sound toggles
  document.querySelectorAll(".sound-toggle").forEach((b) => b.addEventListener("click", toggleUiSound));
  const skyAiFab = document.getElementById("skyAiFab");
  const skyAiClose = document.getElementById("skyAiClose");
  const skyAiForm = document.getElementById("skyAiForm");
  if (skyAiFab) skyAiFab.addEventListener("click", toggleSkyAi);
  if (skyAiClose) skyAiClose.addEventListener("click", () => {
    const p = document.getElementById("skyAiPanel");
    if (p && !p.hidden) setSkyAiOpen(false);
  });
  if (skyAiForm) skyAiForm.addEventListener("submit", (e) => {
    e.preventDefault();
    skyAiAsk(document.getElementById("skyAiInput")?.value);
  });

  // Nav switching
  document.querySelectorAll(".nav-btn").forEach((btn) =>
    btn.addEventListener("click", () => switchView(btn.dataset.view))
  );

  // Search + brand filter
  document.getElementById("componentSearch").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderGrid();
  });
  document.getElementById("brandFilter").addEventListener("change", (e) => {
    state.brand = e.target.value;
    renderGrid();
  });
  document.getElementById("currencySelect").addEventListener("change", (e) => {
    state.currency = e.target.value;
    saveCurrency();
    refreshAll();
    if (lastRecommendation) renderRecoResult(lastRecommendation);
    toast(`Prices shown in ${CURRENCIES[state.currency].label}.`);
  });

  // Build actions
  document.getElementById("clearBuild").addEventListener("click", () => {
    state.selected = {};
    saveState();
    refreshAfterSelection();
    toast("Build cleared.");
  });
  document.getElementById("copyShare").addEventListener("click", () => {
    copyShareLink();
    document.getElementById("shareMsg").textContent = "Link copied to clipboard!";
    setTimeout(() => (document.getElementById("shareMsg").textContent = ""), 2500);
  });
  document.getElementById("exportSpec").addEventListener("click", printBuildSpec);

  // Summary overlay
  document.getElementById("summaryToggle").addEventListener("click", openSummary);
  document.getElementById("summaryClose").addEventListener("click", closeSummary);
  document.getElementById("summaryOverlay").addEventListener("click", (e) => {
    if (e.target.id === "summaryOverlay") closeSummary();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSummary();
      const p = document.getElementById("skyAiPanel");
      if (p && !p.hidden) setSkyAiOpen(false);
    }
  });

  // Custom recommendation form
  document.getElementById("recoForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const use = document.getElementById("recoUse").value;
    const budget = parseInt(document.getElementById("recoBudget").value, 10);
    const brand = document.getElementById("recoBrand").value;
    lastRecommendation = null;
    const result = generateRecommendation(use, budget, brand);
    if (result) {
      renderRecoResult(result);
    } else {
      const box = document.getElementById("recoResult");
      box.hidden = false;
      box.innerHTML = `<p>Couldn't build a recommendation for that combination — try a different budget or brand.</p>`;
    }
  });
});
