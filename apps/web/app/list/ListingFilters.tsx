"use client";

export type SortBy = "newest" | "oldest" | "priceAsc" | "priceDesc" | "tokenIdAsc" | "tokenIdDesc";
export type Preset = "cheap" | "shared" | "mine" | "reset";

export type FilterState = {
  filterSource: "ALL" | "SHARED" | "CUSTOM";
  filterStandard: "ALL" | "ERC721" | "ERC1155";
  filterContract: string;
  filterSeller: string;
  filterMinPrice: string;
  filterMaxPrice: string;
  sortBy: SortBy;
  activePreset: Preset;
};

type Props = {
  filters: FilterState;
  address?: string;
  onFilterChange: (updates: Partial<FilterState>) => void;
  onPreset: (preset: Preset) => void;
};

function presetClass(active: Preset, preset: Preset): string {
  return `presetButton ${active === preset ? "presetActive" : ""}`;
}

export default function ListingFilters({ filters, address, onFilterChange, onPreset }: Props) {
  return (
    <>
      <div className="row">
        <button type="button" onClick={() => onPreset("cheap")} className={presetClass(filters.activePreset, "cheap")}>
          Cheap &lt; 0.05 ETH
        </button>
        <button type="button" onClick={() => onPreset("shared")} className={presetClass(filters.activePreset, "shared")}>
          Shared Collections
        </button>
        <button
          type="button"
          onClick={() => onPreset("mine")}
          disabled={!address}
          className={presetClass(filters.activePreset, "mine")}
        >
          My Collections
        </button>
        <button type="button" onClick={() => onPreset("reset")} className={presetClass(filters.activePreset, "reset")}>
          Reset Filters
        </button>
      </div>
      <div className="gridMini">
        <label>
          Source
          <select
            value={filters.filterSource}
            onChange={(e) => onFilterChange({ filterSource: e.target.value as FilterState["filterSource"], activePreset: "reset" })}
          >
            <option value="ALL">All</option>
            <option value="SHARED">Shared only</option>
            <option value="CUSTOM">Custom only</option>
          </select>
        </label>
        <label>
          Standard
          <select
            value={filters.filterStandard}
            onChange={(e) => onFilterChange({ filterStandard: e.target.value as FilterState["filterStandard"], activePreset: "reset" })}
          >
            <option value="ALL">All</option>
            <option value="ERC721">ERC721</option>
            <option value="ERC1155">ERC1155</option>
          </select>
        </label>
        <label>
          Contract contains
          <input
            value={filters.filterContract}
            onChange={(e) => onFilterChange({ filterContract: e.target.value, activePreset: "reset" })}
            placeholder="0xabc..."
          />
        </label>
        <label>
          Seller contains
          <input
            value={filters.filterSeller}
            onChange={(e) => onFilterChange({ filterSeller: e.target.value, activePreset: "reset" })}
            placeholder="0xseller..."
          />
        </label>
        <label>
          Min price (ETH)
          <input
            value={filters.filterMinPrice}
            onChange={(e) => onFilterChange({ filterMinPrice: e.target.value, activePreset: "reset" })}
            placeholder="0.01"
          />
        </label>
        <label>
          Max price (ETH)
          <input
            value={filters.filterMaxPrice}
            onChange={(e) => onFilterChange({ filterMaxPrice: e.target.value, activePreset: "reset" })}
            placeholder="1.5"
          />
        </label>
        <label>
          Sort
          <select
            value={filters.sortBy}
            onChange={(e) => onFilterChange({ sortBy: e.target.value as SortBy, activePreset: "reset" })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priceAsc">Price low to high</option>
            <option value="priceDesc">Price high to low</option>
            <option value="tokenIdAsc">Token ID low to high</option>
            <option value="tokenIdDesc">Token ID high to low</option>
          </select>
        </label>
      </div>
    </>
  );
}
