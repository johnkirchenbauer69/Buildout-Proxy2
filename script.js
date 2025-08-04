let listingsGlobal = [];   // for access in search/sort
let filteredListingsGlobal = []; // holds current filtered/sorted array for export
let currentTypeFilter = "";   // blank = show all types
let currentSort = { key: null, dir: 1 }

// Map for property type id to label
const propertyTypes = {
  1: "Office",
  2: "Retail",
  3: "Industrial",
  5: "Land",
  6: "Multifamily",
  7: "Special Purpose",
  8: "Hospitality"
};

// --- BUILD THE PROPERTY SUBTYPES MAP ---
const propertySubtypes = {
  101: "Office Building",
  102: "Creative/Loft",
  103: "Executive Suites",
  104: "Medical",
  105: "Institutional/Governmental",
  106: "Office Warehouse",
  107: "Office Condo",
  108: "Coworking",
  109: "Lab",
  201: "Street Retail",
  202: "Strip Center",
  203: "Free Standing Building",
  204: "Regional Mall",
  205: "Retail Pad",
  206: "Vehicle Related",
  207: "Outlet Center",
  208: "Power Center",
  209: "Neighborhood Center",
  210: "Community Center",
  211: "Specialty Center",
  212: "Theme/Festival Center",
  213: "Restaurant",
  214: "Post Office",
  215: "Retail Condo",
  216: "Lifestyle Center",
  301: "Manufacturing",
  302: "Warehouse/Distribution",
  303: "Flex Space",
  304: "Research & Development",
  305: "Refrigerated/Cold Storage",
  306: "Office Showroom",
  307: "Truck Terminal/Hub/Transit",
  308: "Self Storage",
  309: "Industrial Condo",
  310: "Data Center",
  501: "Office",
  502: "Retail",
  503: "Retail-Pad",
  504: "Industrial",
  505: "Residential",
  506: "Multifamily",
  507: "Other",
  601: "High-Rise",
  602: "Mid-Rise",
  603: "Low-Rise/Garden",
  604: "Government Subsidized",
  605: "Mobile Home Park",
  606: "Senior Living",
  607: "Skilled Nursing",
  608: "Single Family Rental Portfolio",
  701: "School",
  702: "Marina",
  703: "Other",
  704: "Golf Course",
  705: "Church",
  801: "Full Service",
  802: "Limited Service",
  803: "Select Service",
  804: "Resort",
  805: "Economy",
  806: "Extended Stay",
  807: "Casino",
  1001: "Single Family",
  1002: "Townhouse / Row House",
  1003: "Condo / Co-op",
  1004: "Manufactured / Mobile Home",
  1005: "Vacation / Timeshare",
  1006: "Other Residential"
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllListings() {
  // Fetch all listings from the proxy.  The API now returns all properties
  // in a single response and accepts optional search/type parameters.  We
  // intentionally avoid pagination on the client because the proxy handles
  // loading and caching for us.
  const res = await fetch('/api/listings');
  if (!res.ok) {
    const errorText = await res.text();
    console.error('API error:', res.status, errorText);
    return [];
  }
  const data = await res.json();
  return data.properties || [];
}

async function loadListings() {
  const [listings, brokerRes, leaseSpacesRes] = await Promise.all([
    fetchAllListings(),
    fetch('/api/brokers'),
    fetch('/api/lease_spaces')
  ]);

  // Parse lease spaces
  const leaseSpacesData = await leaseSpacesRes.json();
  console.log("Lease Spaces Data Raw:", leaseSpacesData);

  // Use the correct array, not the root object
  const leaseSpaces = leaseSpacesData.lease_spaces || [];

  // Group lease spaces by property_id
  const spacesByProperty = {};
  for (const space of leaseSpaces) {
    if (!spacesByProperty[space.property_id]) spacesByProperty[space.property_id] = [];
    spacesByProperty[space.property_id].push(space);
  }


  // Brokers mapping as before
  const brokersData = await brokerRes.json();
  const brokers = brokersData.brokers || brokersData;
  const brokerMap = Object.fromEntries(brokers.map(b => [b.id, b]));

  // Map listings, sum total available SF
  listingsGlobal = listings.map(listing => {
    const broker1 = brokerMap[listing.broker_id];
    const broker2 = brokerMap[listing.second_broker_id];
    const brokerDisplay = [broker1, broker2]
      .filter(Boolean)
      .map(b => `<a href="mailto:${b.email}" class="broker-pill" data-email="${b.email}">${b.first_name} ${b.last_name}</a>`)
      .join(" ");
    const brokersArr = [broker1, broker2].filter(Boolean).map(b => ({
      id: b.id,
      name: `${b.first_name} ${b.last_name}`,
      email: b.email
    }));

    // ---- NEW: SUM TOTAL AVAILABLE SF ----
    const spaces = spacesByProperty[listing.id] || [];
    // Optionally: filter only available lease spaces, if you have a status field
    // const availableSpaces = spaces.filter(s => s.status === 'available');
    // For now, sum all lease spaces
    const totalAvailableSF = spaces.reduce((sum, s) => sum + (s.size_sf || 0), 0);

    return { ...listing, brokerDisplay, brokersArr, totalAvailableSF };
  });

  // Debug logging
  console.log("Listings with totalAvailableSF:", listingsGlobal.map(l => ({
    id: l.id,
    totalAvailableSF: l.totalAvailableSF
  })));

  renderTable(listingsGlobal);
}


// Only call loadListings once after the DOM is ready.  The call at the end
// of this script will trigger the data load.
// --- RENDER TABLE FUNCTION ---
// This function renders the listings into the HTML table
// It should be called after the listings are loaded

function renderTable(listingsArr) {
  const tbody = document.getElementById("listing-body");
  tbody.innerHTML = "";

  listingsArr.forEach(listing => {
    // Table Fields
    const location = `${listing.address || ""}, ${listing.city || ""}, ${listing.state || ""} ${listing.zip || ""}`;
    const size = listing.totalAvailableSF
      ? `${listing.totalAvailableSF.toLocaleString()} SF`
      : (listing.building_size_sf ? `${listing.building_size_sf.toLocaleString()} SF` : "—");
    const type = listing.lease && listing.sale ? "For Sale & Lease" : listing.lease ? "For Lease" : "For Sale";
    const title = listing.lease_listing_web_title || listing.sale_listing_web_title || "Untitled";
    const image = listing.photos?.[0]?.url || "https://via.placeholder.com/300x200";
    const url = listing.lease_listing_url || listing.sale_listing_url || "#";
    const brokerDisplay = listing.brokerDisplay;
    // Brochure/Video logic
    let brochureUrl = null;
    if (type === "For Sale") brochureUrl = listing.sale_pdf_url;
    else if (type === "For Lease") brochureUrl = listing.lease_pdf_url;
    else if (type === "For Sale & Lease") brochureUrl = listing.sale_pdf_url || listing.lease_pdf_url;
    let videoUrl = listing.you_tube_url || listing.matterport_url || null;

    // Property subtype
    const subtype = propertySubtypes[listing.property_subtype_id] || "";
    const subtypeTypeLine = [subtype, type].filter(Boolean).join(" – ");
    // Row
    const mainRow = document.createElement("tr");
    mainRow.classList.add("main-row");
    mainRow.onclick = () => {
      mainRow.classList.toggle("open");
      expandRow.classList.toggle("open"); // Add this line for animated expansion
    };
    
    mainRow.innerHTML = `
      <td>${location}</td>
      <td>${size}</td>
      <td>${brokerDisplay}</td>
      <td><span class="badge">${type}</span></td>
    `;

    // Pick the correct description field
    let description = "";
    if (listing.lease && listing.lease_description) {
      description = listing.lease_description;
    } else if (listing.sale && listing.sale_description) {
      description = listing.sale_description;
    } else {
      description = "No description available.";
    }
    // Expandable row
    let buttonsHtml = `<a href="${url}" class="cta" target="_blank">View Listing</a>`;
    if (brochureUrl) buttonsHtml += `<a href="${brochureUrl}" class="cta secondary" target="_blank">View Brochure</a>`;
    if (videoUrl) buttonsHtml += `<a href="${videoUrl}" class="cta secondary" target="_blank">View Video</a>`;

    
    const expandRow = document.createElement("tr");
    expandRow.classList.add("expand-row");
    expandRow.innerHTML = `
      <td colspan="4">
      <div class="property-card">
        <img src="${image}" alt="Property Image">
        <div class="property-details">
          <h3>${location}</h3>
          <div class="property-subtype-type">${subtypeTypeLine}</div>
          <div class="property-description">${description}</div>
          <div class="property-size">
            ${listing.totalAvailableSF
              ? `<strong>Available:</strong> ${listing.totalAvailableSF.toLocaleString()} SF${listing.building_size_sf ? ` <span class="building-size">of ${listing.building_size_sf.toLocaleString()} SF</span>` : ""}`
              : (listing.building_size_sf ? `${listing.building_size_sf.toLocaleString()} SF` : "—")
            }
          </div>
          <div class="property-ctas">${buttonsHtml}</div>
        </div>
      </div>
    </td>
  `;
    tbody.appendChild(mainRow);
    tbody.appendChild(expandRow);
  });
}

// --- SEARCH FUNCTIONALITY ---
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterAndSort();
    });
  }

  // Sorting click events
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener("click", function () {
      const key = this.getAttribute("data-sort");
      if (currentSort.key === key) {
        currentSort.dir *= -1;
      } else {
        currentSort.key = key;
        currentSort.dir = 1;
      }
      filterAndSort();
      updateSortIndicators();
    });
  });

  // --- FILTER BUTTONS ---
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      currentTypeFilter = this.getAttribute("data-type"); // "3" for Industrial, "" for All
      // UI update: highlight selected button
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      filterAndSort();
    });
  });

  // Export to CSV
  const csvBtn = document.getElementById('csvExportBtn');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      // Use the filtered list if available, else fall back to all listings
      const toExport = filteredListingsGlobal.length
        ? filteredListingsGlobal
        : listingsGlobal;
      exportToCSV(toExport);
    });
  }
  // Export to PDF – uses browser print dialog for now.  For a more
  // sophisticated PDF, integrate a library like jsPDF.
  const pdfBtn = document.getElementById('pdfExportBtn');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      window.print();
    });
  }
});

// --- FILTER & SORT FUNCTION ---
function filterAndSort() {
  const q = (document.getElementById("searchInput")?.value || "").toLowerCase();
  let arr = listingsGlobal;
  // 🟢 Filter by property type
  if (currentTypeFilter) {
    arr = arr.filter(l => String(l.property_type_id) === currentTypeFilter);
  }
  if (q) {
    arr = arr.filter(l =>

  // Filter by property type if a filter is applied
      (l.address || "").toLowerCase().includes(q) ||
      (l.city || "").toLowerCase().includes(q) ||
      (l.state || "").toLowerCase().includes(q) ||
      (l.zip || "").toLowerCase().includes(q) ||

  // Filter by search query across various listing fields
      (l.brokerDisplay || "").toLowerCase().includes(q) ||
      (l.lease_listing_web_title || "").toLowerCase().includes(q) ||
      (l.sale_listing_web_title || "").toLowerCase().includes(q)
    );
  }

  // Sort
  if (currentSort.key) {
    arr = [...arr].sort((a, b) => {
      let v1, v2;
      switch (currentSort.key) {
        case "location":

  // Sort the filtered array based on the current sorting criteria
          v1 = `${a.address || ""} ${a.city || ""} ${a.state || ""} ${a.zip || ""}`.toLowerCase();
          v2 = `${b.address || ""} ${b.city || ""} ${b.state || ""} ${b.zip || ""}`.toLowerCase();
          break;
        case "size":
          v1 = a.building_size_sf || 0;
          v2 = b.building_size_sf || 0;
          break;
        case "brokers":
          v1 = a.brokerDisplay || "";
          v2 = b.brokerDisplay || "";
          break;
        case "type":
          v1 = (a.lease && a.sale) ? "For Sale & Lease" : a.lease ? "For Lease" : "For Sale";
          v2 = (b.lease && b.sale) ? "For Sale & Lease" : b.lease ? "For Lease" : "For Sale";
          break;
        default:
          v1 = v2 = "";
      }
      if (typeof v1 === "string") v1 = v1.toLowerCase();
      if (typeof v2 === "string") v2 = v2.toLowerCase();
      if (v1 < v2) return -1 * currentSort.dir;
      if (v1 > v2) return 1 * currentSort.dir;
      return 0;
    });
  }
  // Save to global so export can access the filtered list
  filteredListingsGlobal = arr;
  renderTable(arr);
}

// --- SORT INDICATORS (OPTIONAL) ---
function updateSortIndicators() {
  document.querySelectorAll('th.sortable').forEach(th => {

  // Render the sorted and filtered listings in the table
    th.classList.remove("asc", "desc");
    if (currentSort.key && th.getAttribute("data-sort") === currentSort.key) {
      th.classList.add(currentSort.dir === 1 ? "asc" : "desc");
    }
  });
}

loadListings();

// --- EXPORT TO CSV FUNCTION ---
function exportToCSV(list) {
  if (!list || !list.length) {
    alert('No listings to export.');
    return;
  }
  const header = [
    'Property',
    'Size',
    'Brokers',
    'Type',
    'Available SF',
    'URL'
  ];
  const rows = list.map((l) => {
    const location = `${l.address || ''}, ${l.city || ''}, ${
      l.state || ''
    } ${l.zip || ''}`.trim();
    const size =
      l.totalAvailableSF
        ? `${l.totalAvailableSF.toLocaleString()} SF`
        : l.building_size_sf
        ? `${l.building_size_sf.toLocaleString()} SF`
        : '';
    const brokers = l.brokersArr
      ? l.brokersArr.map((b) => b.name).join('; ')
      : '';
    const type = l.lease && l.sale
      ? 'For Sale & Lease'
      : l.lease
      ? 'For Lease'
      : 'For Sale';
    const url = l.lease_listing_url || l.sale_listing_url || '';
    const avail = l.totalAvailableSF || '';
    return [location, size, brokers, type, avail, url];
  });
  let csv = header.join(',') + '\n';
  csv += rows
    .map((r) =>
      r
        .map((v) => {
          const val = (v || '').toString().replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(',')
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'listings.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
