/**
 * docs/js/controls.js
 * ====================
 * Wires all interactive UI controls to their render/panel handlers.
 *
 * All active filters are ANDed together: a node is dimmed if it fails
 * ANY active filter.  _applyFilters() is the single place where dimming
 * is computed so filters never overwrite each other.
 *
 * Responsibilities:
 *   - Search input        → highlight/dim by name
 *   - Lin filter          → dim nodes not in the selected lin
 *   - Industry filter     → dim nodes not in the selected industry
 *   - Company filter      → dim nodes not in the selected company
 *   - Location filter     → dim nodes not in the selected location
 *   - Has-email checkbox  → dim nodes with no email
 *   - Has-LinkedIn checkbox → dim nodes with no LinkedIn
 *   - Color toggle        → enable/disable lin colouring on nodes
 *   - Fit button          → call fitTree()
 *   - Panel close         → #info-close button, SVG background click, Escape key
 *
 * Dependencies:
 *   - render.js — fitTree(), setColorOn(), getColorOn(), setLayoutMode()
 *   - panel.js  — closePanel()
 *   - D3 v7 loaded as a global <script> in index.html
 */

import { fitTree, setColorOn, setLayoutMode } from "./render.js";
import { closePanel } from "./panel.js";

// ---------------------------------------------------------------------------
// Active filter state — all ANDed together in _applyFilters()
// ---------------------------------------------------------------------------

let _searchQuery    = "";
let _linFilter      = "";
let _industryFilter = [];   // array — multi-select
let _roleFilter        = [];   // array — multi-select
let _companyFilter     = "";
let _allCompanyFilter = [];   // array — multi-select
let _locationFilter = "";
let _hasEmail       = false;
let _hasLinkedin    = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach all event listeners for the control bar and panel close gestures.
 * Call once after the tree has been rendered.
 */
export function setupControls() {
  _setupSearch();
  _setupLinFilter();
  _setupIndustryFilter();
  _setupRoleFilter();
  _setupCompanyFilter();
  _setupAllCompanyFilter();
  _setupLocationFilter();
  _setupHasEmail();
  _setupHasLinkedin();
  _setupClearFilters();
  _setupLayoutMode();
  _setupColorToggle();
  _setupFitButton();
  _setupPanelClose();
  _setupControlsToggle();
  _setupLegendToggle();
}

// ---------------------------------------------------------------------------
// Shared filter engine
// ---------------------------------------------------------------------------

/**
 * Apply all active filters simultaneously.
 * A node is dimmed if it fails any active filter.
 * A node is highlighted only when the name search matches.
 */
function _applyFilters() {
  let visibleCount = 0;
  let totalCount   = 0;

  d3.selectAll(".node")
    .classed("highlighted", d =>
      !!_searchQuery && d.data.name.toLowerCase().includes(_searchQuery))
    .classed("dimmed", d => {
      totalCount++;
      if (_searchQuery    && !d.data.name.toLowerCase().includes(_searchQuery)) return true;
      if (_linFilter      && d.data._lin !== _linFilter)                        return true;
      if (_industryFilter.length) {
        const memberIndustries = (d.data.industry || "").split(",").map(s => s.trim()).filter(Boolean);
        if (!_industryFilter.some(sel => memberIndustries.includes(sel))) return true;
      }
      if (_roleFilter.length) {
        const memberRoles = (d.data.role || "").split(",").map(s => s.trim()).filter(Boolean);
        if (!_roleFilter.some(sel => memberRoles.includes(sel))) return true;
      }
      if (_companyFilter  && (d.data.current_company  || "").trim() !== _companyFilter)  return true;
      if (_allCompanyFilter.length) {
        const allCompanies = [
          ...(d.data.current_company || "").split(",").map(s => s.trim()).filter(Boolean),
          ...(d.data.past_companies  || "").split(",").map(s => s.trim()).filter(Boolean),
        ];
        if (!_allCompanyFilter.some(sel => allCompanies.includes(sel))) return true;
      }
      if (_locationFilter && (d.data.location         || "").trim() !== _locationFilter) return true;
      if (_hasEmail       && !(d.data["non-penn_email"] || "").trim())                   return true;
      if (_hasLinkedin    && !(d.data.linkedin          || "").trim())                   return true;
      visibleCount++;
      return false;
    });

  // Update member count display.
  const memberCountEl = document.getElementById("member-count");
  if (memberCountEl) {
    const filtersActive = visibleCount < totalCount;
    memberCountEl.textContent = filtersActive
      ? `${visibleCount} / ${totalCount} members`
      : `${totalCount} members`;
  }

  // Show "Clear" button only when at least one filter is active.
  const count = [_searchQuery, _linFilter, _companyFilter, _locationFilter]
                  .filter(Boolean).length
                + _industryFilter.length
                + _roleFilter.length
                + _allCompanyFilter.length
                + (_hasEmail ? 1 : 0)
                + (_hasLinkedin ? 1 : 0);
  document.getElementById("clear-filters").style.display = count ? "" : "none";

  // Update filter badge on the mobile controls toggle.
  const badge = document.getElementById("active-filter-count");
  if (badge) {
    badge.textContent = count || "";
    badge.style.display = count ? "inline-flex" : "none";
  }
}

// ---------------------------------------------------------------------------
// Private helpers — one function per control group
// ---------------------------------------------------------------------------

function _setupSearch() {
  document.getElementById("search").addEventListener("input", function () {
    _searchQuery = this.value.toLowerCase().trim();
    _applyFilters();
  });
}

function _setupLinFilter() {
  document.getElementById("lin-filter").addEventListener("change", function () {
    _linFilter = this.value;
    _applyFilters();
  });
}

function _setupIndustryFilter() {
  const trigger     = document.getElementById("industry-trigger");
  const dropdown    = document.getElementById("industry-dropdown");
  const tagsEl      = document.getElementById("industry-tags");
  const placeholder = document.getElementById("industry-placeholder");

  // Toggle dropdown open/close on trigger click.
  trigger.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  // Prevent clicks inside the dropdown from bubbling to the document handler.
  dropdown.addEventListener("click", e => e.stopPropagation());

  // Close dropdown when clicking anywhere outside the component.
  document.addEventListener("click", () => dropdown.classList.remove("open"));

  // Checkbox changes → update tags and filter.
  dropdown.addEventListener("change", () => _syncIndustryTags(tagsEl, placeholder, dropdown));
}

function _syncIndustryTags(tagsEl, placeholder, dropdown) {
  _industryFilter = Array.from(dropdown.querySelectorAll("input:checked")).map(i => i.value);

  // Re-render tags.
  tagsEl.innerHTML = "";
  _industryFilter.forEach(val => {
    const tag = document.createElement("span");
    tag.className = "tag-select-tag";
    tag.innerHTML = `${val}<button class="tag-remove" data-val="${val}">&times;</button>`;
    tagsEl.appendChild(tag);
  });

  placeholder.style.display = _industryFilter.length ? "none" : "";

  // Wire × buttons — uncheck the box and sync again.
  tagsEl.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const cb = dropdown.querySelector(`input[value="${btn.dataset.val}"]`);
      if (cb) cb.checked = false;
      _syncIndustryTags(tagsEl, placeholder, dropdown);
    });
  });

  _applyFilters();
}

function _setupRoleFilter() {
  const trigger     = document.getElementById("role-trigger");
  const dropdown    = document.getElementById("role-dropdown");
  const tagsEl      = document.getElementById("role-tags");
  const placeholder = document.getElementById("role-placeholder");

  trigger.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  dropdown.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => dropdown.classList.remove("open"));
  dropdown.addEventListener("change", () => _syncRoleTags(tagsEl, placeholder, dropdown));
}

function _syncRoleTags(tagsEl, placeholder, dropdown) {
  _roleFilter = Array.from(dropdown.querySelectorAll("input:checked")).map(i => i.value);

  tagsEl.innerHTML = "";
  _roleFilter.forEach(val => {
    const tag = document.createElement("span");
    tag.className = "tag-select-tag";
    tag.innerHTML = `${val}<button class="tag-remove" data-val="${val}">&times;</button>`;
    tagsEl.appendChild(tag);
  });

  placeholder.style.display = _roleFilter.length ? "none" : "";

  tagsEl.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const cb = dropdown.querySelector(`input[value="${btn.dataset.val}"]`);
      if (cb) cb.checked = false;
      _syncRoleTags(tagsEl, placeholder, dropdown);
    });
  });

  _applyFilters();
}

function _setupAllCompanyFilter() {
  const trigger     = document.getElementById("all-company-trigger");
  const dropdown    = document.getElementById("all-company-dropdown");
  const tagsEl      = document.getElementById("all-company-tags");
  const placeholder = document.getElementById("all-company-placeholder");

  trigger.addEventListener("click", e => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  dropdown.addEventListener("click", e => e.stopPropagation());
  document.addEventListener("click", () => dropdown.classList.remove("open"));
  dropdown.addEventListener("change", () => _syncAllCompanyTags(tagsEl, placeholder, dropdown));
}

function _syncAllCompanyTags(tagsEl, placeholder, dropdown) {
  _allCompanyFilter = Array.from(dropdown.querySelectorAll("input:checked")).map(i => i.value);

  tagsEl.innerHTML = "";
  _allCompanyFilter.forEach(val => {
    const tag = document.createElement("span");
    tag.className = "tag-select-tag";
    tag.innerHTML = `${val}<button class="tag-remove" data-val="${val}">&times;</button>`;
    tagsEl.appendChild(tag);
  });

  placeholder.style.display = _allCompanyFilter.length ? "none" : "";

  tagsEl.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const cb = dropdown.querySelector(`input[value="${btn.dataset.val}"]`);
      if (cb) cb.checked = false;
      _syncAllCompanyTags(tagsEl, placeholder, dropdown);
    });
  });

  _applyFilters();
}

function _setupCompanyFilter() {
  document.getElementById("company-filter").addEventListener("change", function () {
    _companyFilter = this.value;
    _applyFilters();
  });
}

function _setupLocationFilter() {
  document.getElementById("location-filter").addEventListener("change", function () {
    _locationFilter = this.value;
    _applyFilters();
  });
}

function _setupHasEmail() {
  document.getElementById("has-email").addEventListener("change", function () {
    _hasEmail = this.checked;
    _applyFilters();
  });
}

function _setupHasLinkedin() {
  document.getElementById("has-linkedin").addEventListener("change", function () {
    _hasLinkedin = this.checked;
    _applyFilters();
  });
}

function _setupClearFilters() {
  document.getElementById("clear-filters").addEventListener("click", () => {
    // Reset state.
    _searchQuery = ""; _linFilter = ""; _industryFilter = []; _roleFilter = []; _allCompanyFilter = [];
    _companyFilter = ""; _locationFilter = "";
    _hasEmail = false; _hasLinkedin = false;

    // Reset UI controls.
    document.getElementById("search").value = "";
    document.getElementById("lin-filter").value = "";
    document.getElementById("company-filter").value = "";
    document.getElementById("location-filter").value = "";
    document.getElementById("has-email").checked = false;
    document.getElementById("has-linkedin").checked = false;

    // Reset industry tag-select.
    const dropdown    = document.getElementById("industry-dropdown");
    const tagsEl      = document.getElementById("industry-tags");
    const placeholder = document.getElementById("industry-placeholder");
    dropdown.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = false; });
    tagsEl.innerHTML = "";
    placeholder.style.display = "";

    // Reset role tag-select.
    const roleDropdown    = document.getElementById("role-dropdown");
    const roleTags        = document.getElementById("role-tags");
    const rolePlaceholder = document.getElementById("role-placeholder");
    roleDropdown.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = false; });
    roleTags.innerHTML = "";
    rolePlaceholder.style.display = "";

    // Reset past company tag-select.
    const pastDropdown    = document.getElementById("all-company-dropdown");
    const pastTags        = document.getElementById("all-company-tags");
    const pastPlaceholder = document.getElementById("all-company-placeholder");
    pastDropdown.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = false; });
    pastTags.innerHTML = "";
    pastPlaceholder.style.display = "";

    _applyFilters();
  });
}

function _setupLayoutMode() {
  document.getElementById("layout-mode").addEventListener("change", function () {
    setLayoutMode(this.value);
  });
}

function _setupColorToggle() {
  document.getElementById("color-toggle").addEventListener("change", function () {
    setColorOn(this.checked);
  });
}

function _setupFitButton() {
  document.getElementById("fit-btn").addEventListener("click", fitTree);
}

function _setupControlsToggle() {
  const btn     = document.getElementById("controls-toggle");
  const content = document.getElementById("controls-content");
  btn.addEventListener("click", () => {
    const collapsed = content.classList.toggle("collapsed");
    btn.classList.toggle("collapsed", collapsed);
  });
}

function _setupLegendToggle() {
  const btn     = document.getElementById("legend-toggle");
  const items   = document.getElementById("legend-items");
  const chevron = btn.querySelector(".legend-chevron");
  btn.addEventListener("click", () => {
    const collapsed = items.classList.toggle("collapsed");
    chevron.style.transform = collapsed ? "rotate(90deg)" : "";
    btn.setAttribute("aria-expanded", String(!collapsed));
  });
}

function _setupPanelClose() {
  document.getElementById("info-close").addEventListener("click", closePanel);
  document.getElementById("tree-svg").addEventListener("click", closePanel);
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape") closePanel();
  });
}
