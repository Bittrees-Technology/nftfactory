"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { encodeFunctionData, formatEther, keccak256, stringToBytes } from "viem";
import type { Address, Hex } from "viem";
import { namehash } from "viem/ens";
import { encodeRegisterSubname, toHexWei, truncateHash } from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import {
  fetchCollectionsByOwner,
  fetchProfileResolution,
  fetchProfilesByOwner,
  linkProfileIdentity,
  type ApiOwnedCollections,
  type ApiProfileRecord
} from "../../lib/indexerApi";
import { verifyOwnedCollectionsOnChain } from "../../lib/onchainCollections";

const SUBNAME_FEE_ETH = "0.001";
const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ENS_NAME_WRAPPER_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(process.env.NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS || "")
  ? (process.env.NEXT_PUBLIC_ENS_NAME_WRAPPER_ADDRESS as Address)
  : null;
const ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS = /^0x[a-fA-F0-9]{40}$/.test(
  process.env.NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS || ""
)
  ? (process.env.NEXT_PUBLIC_ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS as Address)
  : null;
const ENS_REGISTRY_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }]
  }
] as const;
const ENS_NAME_WRAPPER_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  }
] as const;
const ENS_ETH_REGISTRAR_CONTROLLER_ABI = [
  {
    type: "function",
    name: "available",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "rentPrice",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" }
    ],
    outputs: [
      { name: "base", type: "uint256" },
      { name: "premium", type: "uint256" }
    ]
  },
  {
    type: "function",
    name: "minCommitmentAge",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "makeCommitment",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" }
    ],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: []
  },
  {
    type: "function",
    name: "register",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" }
    ],
    outputs: []
  }
] as const;
const SUBNAME_REGISTRAR_ABI = [
  {
    type: "function",
    name: "subnames",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "expiresAt", type: "uint256" },
      { name: "mintedCount", type: "uint256" },
      { name: "exists", type: "bool" }
    ]
  }
] as const;

type PendingEnsRegistration = {
  fullName: string;
  label: string;
  durationYears: number;
  durationSeconds: string;
  secret: Hex;
  committedAt: number;
  minCommitmentAge: number;
  estimatedCostWei: string;
  commitHash?: Hex;
};

type SetupState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

function normalizeSlug(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const first = raw.split(".")[0] || "";
  return normalizeLabel(first);
}

function deriveEnsRouteFromName(fullName: string): string {
  const normalized = String(fullName || "")
    .trim()
    .toLowerCase()
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  if (!normalized) return "";
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  const valid = parts.every((part) => Boolean(normalizeLabel(part)));
  if (!valid) return "";
  return parts.reverse().join(".");
}

function deriveProfileRoute(
  value: string,
  mode: "register-eth" | "register-eth-subname" | "ens" | "external-subname" | "nftfactory-subname"
): string {
  const fullName = normalizeIdentityFullName(value, mode);
  if (!fullName) return "";
  if (mode === "nftfactory-subname") {
    return normalizeLabel(value);
  }
  return deriveEnsRouteFromName(fullName);
}

function normalizeIdentityFullName(
  value: string,
  mode: "register-eth" | "register-eth-subname" | "ens" | "external-subname" | "nftfactory-subname"
): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (mode === "register-eth") return raw.endsWith(".eth") ? raw : `${normalizeLabel(raw)}.eth`;
  if (mode === "nftfactory-subname") return `${normalizeLabel(raw)}.nftfactory.eth`;
  return raw;
}

function sourceToIdentityMode(source: ApiProfileRecord["source"]): "ens" | "external-subname" | "nftfactory-subname" {
  if (source === "ens") return "ens";
  if (source === "external-subname") return "external-subname";
  return "nftfactory-subname";
}

async function resolveEnsEffectiveOwner(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  fullName: string
): Promise<{ owner: string; wrapped: boolean }> {
  const node = namehash(fullName);
  const registryOwner = String(
    await publicClient.readContract({
      address: ENS_REGISTRY_ADDRESS,
      abi: ENS_REGISTRY_ABI,
      functionName: "owner",
      args: [node]
    })
  ).toLowerCase();

  if (registryOwner === ZERO_ADDRESS.toLowerCase()) {
    return { owner: registryOwner, wrapped: false };
  }

  if (ENS_NAME_WRAPPER_ADDRESS && registryOwner === ENS_NAME_WRAPPER_ADDRESS.toLowerCase()) {
    const wrappedOwner = String(
      await publicClient.readContract({
        address: ENS_NAME_WRAPPER_ADDRESS,
        abi: ENS_NAME_WRAPPER_ABI,
        functionName: "ownerOf",
        args: [BigInt(node)]
      })
    ).toLowerCase();
    return { owner: wrappedOwner, wrapped: true };
  }

  return { owner: registryOwner, wrapped: false };
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function dedupeProfiles(items: ApiProfileRecord[]): ApiProfileRecord[] {
  const map = new Map<string, ApiProfileRecord>();
  for (const item of items) {
    const key = `${item.slug}:${item.ownerAddress}:${item.source}:${item.collectionAddress || ""}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function createEnsPendingKey(address: string): string {
  return `nftfactory:ens-registration:${address.toLowerCase()}`;
}

function createPrimaryProfileKey(address: string): string {
  return `nftfactory:primary-profile:${address.toLowerCase()}`;
}

function createCommitmentSecret(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}` as Hex;
}

function createLocalProfileRecord(args: {
  fullName: string;
  slug: string;
  source: ApiProfileRecord["source"];
  ownerAddress: string;
  collectionAddress?: string;
}): ApiProfileRecord {
  return {
    slug: args.slug,
    fullName: args.fullName,
    source: args.source,
    ownerAddress: args.ownerAddress.toLowerCase(),
    collectionAddress: args.collectionAddress?.toLowerCase() || null,
    tagline: null,
    displayName: null,
    bio: null,
    bannerUrl: null,
    avatarUrl: null,
    featuredUrl: null,
    accentColor: null,
    links: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export default function ProfileLandingClient({ initialLabel = "" }: { initialLabel?: string }) {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [identityName, setIdentityName] = useState(initialLabel);
  const [subnameParent, setSubnameParent] = useState("");
  const [profiles, setProfiles] = useState<ApiProfileRecord[]>([]);
  const [collections, setCollections] = useState<ApiOwnedCollections["collections"]>([]);
  const [verifiedCollections, setVerifiedCollections] = useState<ApiOwnedCollections["collections"]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [identityMode, setIdentityMode] = useState<
    "register-eth" | "register-eth-subname" | "ens" | "external-subname" | "nftfactory-subname"
  >("nftfactory-subname");
  const [registrationYears, setRegistrationYears] = useState("1");
  const [pendingEnsRegistration, setPendingEnsRegistration] = useState<PendingEnsRegistration | null>(null);
  const [registrationCountdown, setRegistrationCountdown] = useState(0);
  const [lookupNote, setLookupNote] = useState("");
  const [checkedIdentityReady, setCheckedIdentityReady] = useState(false);
  const [postLinkProfile, setPostLinkProfile] = useState<ApiProfileRecord | null>(null);
  const [postLinkMintCta, setPostLinkMintCta] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>({ status: "idle" });

  const explorerBase = getExplorerBaseUrl(config.chainId);
  const wrongNetwork = isConnected && chainId !== config.chainId;
  const slug = normalizeSlug(identityName);
  const effectiveIdentityValue =
    identityMode === "register-eth-subname"
      ? [normalizeLabel(identityName), String(subnameParent || "").trim().toLowerCase()].filter(Boolean).join(".")
      : identityName;
  const normalizedFullName = normalizeIdentityFullName(effectiveIdentityValue, identityMode);
  const derivedRouteSlug = deriveProfileRoute(effectiveIdentityValue, identityMode);

  useEffect(() => {
    if (!address || !isConnected) {
      setProfiles([]);
      setCollections([]);
      setSelectedCollection("");
      return;
    }

    let cancelled = false;
    void Promise.allSettled([fetchProfilesByOwner(address), fetchCollectionsByOwner(address)])
      .then((results) => {
        if (cancelled) return;

        const profileResult = results[0];
        if (profileResult.status === "fulfilled") {
          const nextProfiles = dedupeProfiles(profileResult.value.profiles || []);
          setProfiles(nextProfiles);
        } else {
          setProfiles([]);
        }

        const collectionResult = results[1];
        if (collectionResult.status === "fulfilled") {
          const nextCollections = collectionResult.value.collections || [];
          setCollections(nextCollections);
          setSelectedCollection((current) => current || nextCollections[0]?.contractAddress || "");
        } else {
          setCollections([]);
          setSelectedCollection("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfiles([]);
          setCollections([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  useEffect(() => {
    if (!address) {
      setVerifiedCollections([]);
      return;
    }
    if (collections.length === 0 || !publicClient) {
      setVerifiedCollections([]);
      return;
    }

    let cancelled = false;
    void verifyOwnedCollectionsOnChain(publicClient, address, collections).then((verified) => {
      if (cancelled) return;
      const verifiedAddresses = new Set(verified.map((item) => item.contractAddress.toLowerCase()));
      const nextCollections = collections.filter((item) =>
        verifiedAddresses.has(item.contractAddress.toLowerCase())
      );
      setVerifiedCollections(nextCollections);
      setSelectedCollection((current) => {
        if (current && nextCollections.some((item) => item.contractAddress.toLowerCase() === current.toLowerCase())) {
          return current;
        }
        return nextCollections[0]?.contractAddress || "";
      });
    });

    return () => {
      cancelled = true;
    };
  }, [address, collections, publicClient]);

  useEffect(() => {
    if (!slug || !normalizedFullName) {
      setLookupNote("");
      setCheckedIdentityReady(false);
      return;
    }
    setCheckedIdentityReady(false);
    let cancelled = false;
    void autoCheckIdentity(cancelled);
    return () => {
      cancelled = true;
    };
  }, [identityMode, normalizedFullName, registrationYears, slug]);

  useEffect(() => {
    if (!address) {
      setPendingEnsRegistration(null);
      return;
    }

      const raw = globalThis.localStorage.getItem(createEnsPendingKey(address));
    if (!raw) {
      setPendingEnsRegistration(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PendingEnsRegistration;
      setPendingEnsRegistration(parsed);
      setIdentityMode("register-eth");
      setIdentityName(parsed.fullName);
      setRegistrationYears(String(parsed.durationYears));
    } catch {
      globalThis.localStorage.removeItem(createEnsPendingKey(address));
      setPendingEnsRegistration(null);
    }
  }, [address]);

  useEffect(() => {
    if (!pendingEnsRegistration) {
      setRegistrationCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const unlockAt = pendingEnsRegistration.committedAt + pendingEnsRegistration.minCommitmentAge * 1000;
      const remaining = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
      setRegistrationCountdown(remaining);
    };

    updateCountdown();
    const timer = globalThis.setInterval(updateCountdown, 1000);
    return () => globalThis.clearInterval(timer);
  }, [pendingEnsRegistration]);

  const identityLabel = useMemo(() => {
    if (identityMode === "register-eth") return "New .eth label";
    if (identityMode === "register-eth-subname") return "New subname label";
    if (identityMode === "ens") return "Existing ENS name";
    if (identityMode === "external-subname") return "Existing ENS subname";
    return "New nftfactory label";
  }, [identityMode]);

  const identityHint = useMemo(() => {
    if (identityMode === "register-eth")
      return "Enter a fresh .eth label like artist. NFTFactory will check ENS availability, then run the commit/register flow.";
    if (identityMode === "register-eth-subname")
      return "Enter a new subname label and the existing parent .eth name you already control. NFTFactory checks parent ownership here; external ENS subname creation is not fully wired yet.";
    if (identityMode === "ens") return "Enter a full ENS name like artist.eth to link an existing ENS identity you already own.";
    if (identityMode === "external-subname")
      return "Enter a full subname like music.artist.eth to link an existing ENS subname you already control.";
    return "Enter a plain label like artist to create artist.nftfactory.eth on-chain. This is the default identity path here.";
  }, [identityMode]);

  const ensRegistrationStep = useMemo(() => {
    if (identityMode !== "register-eth") return "";
    if (setupState.status === "pending") return "Commit";
    if (!pendingEnsRegistration) return "Check";
    if (registrationCountdown > 0) return "Wait";
    return "Register";
  }, [identityMode, pendingEnsRegistration, registrationCountdown, setupState.status]);

  const identityStatusText = useMemo(() => {
    if (!slug || !normalizedFullName) return "";
    if (checkedIdentityReady) {
      if (identityMode === "register-eth") return "Status: available in ENS";
      if (identityMode === "register-eth-subname") return "Status: parent ownership confirmed";
      if (identityMode === "nftfactory-subname") return "Status: available on-chain";
      return "Status: owned in ENS and ready to link";
    }
    if (lookupNote) return "Status: review the current check result";
    return "";
  }, [checkedIdentityReady, identityMode, lookupNote, normalizedFullName, slug]);

  async function runIdentityAction(): Promise<void> {
    if (identityMode === "register-eth") {
      if (pendingEnsRegistration) {
        if (registrationCountdown > 0) {
          setSetupState({
            status: "error",
            message: `Wait ${registrationCountdown}s before completing ENS registration.`
          });
          return;
        }
        await completeEthRegistration();
        return;
      }
      await beginEthRegistration();
      return;
    }
    if (identityMode === "register-eth-subname") {
      setSetupState({
        status: "error",
        message:
          "External ENS subname creation is not fully wired here yet. Use Link existing ENS subname, or create an nftfactory.eth subname."
      });
      return;
    }
    if (identityMode === "ens") {
      await linkIdentity("ens", { launchMint: true });
      return;
    }
    if (identityMode === "external-subname") {
      await linkIdentity("external-subname");
      return;
    }
    await createNftFactorySubname();
  }

  async function checkEnsRegistryIdentity(cancelled = false): Promise<void> {
    if (!publicClient) {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("ENS registry lookup is unavailable right now.");
      }
      return;
    }

    try {
      const { owner, wrapped } = await resolveEnsEffectiveOwner(publicClient, normalizedFullName);
      if (cancelled) return;

      const ownerAddress = String(owner).toLowerCase();
      if (ownerAddress !== ZERO_ADDRESS.toLowerCase()) {
        if (address && ownerAddress === address.toLowerCase()) {
          setCheckedIdentityReady(true);
          setLookupNote(
            `${normalizedFullName} exists in ENS and is owned by the connected wallet${wrapped ? " (via NameWrapper)" : ""}.`
          );
          return;
        }
        setCheckedIdentityReady(false);
        setLookupNote(
          `${normalizedFullName} exists in ENS, but it is not owned by the connected wallet${wrapped ? " (via NameWrapper)" : ""}.`
        );
        return;
      }

      setCheckedIdentityReady(false);
      setLookupNote(
        `${normalizedFullName} is not currently registered in the ENS registry. Use Register .eth for new .eth names, or create an nftfactory.eth subname here.`
      );
    } catch {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("ENS registry lookup is unavailable right now.");
      }
    }
  }

  async function checkEthRegistrationAvailability(cancelled = false): Promise<void> {
    if (!publicClient || !ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS) {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("ENS .eth registration is not configured here yet.");
      }
      return;
    }

    const label = normalizeLabel(identityName.replace(/\.eth$/i, ""));
    if (!label || label.includes(".")) {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("Enter a single .eth label like artist.eth.");
      }
      return;
    }

    try {
      const duration = BigInt(Number(registrationYears || "1") * 31536000);
      const available = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "available",
        args: [label]
      });
      if (!available) {
        if (!cancelled) {
          setCheckedIdentityReady(false);
          setLookupNote(`${label}.eth is already registered in ENS.`);
        }
        return;
      }

      const [base, premium] = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [label, duration]
      });
      if (!cancelled) {
        setCheckedIdentityReady(true);
        const total = BigInt(base) + BigInt(premium);
        setLookupNote(
          `${label}.eth is available to register. Estimated ${registrationYears}-year cost: ${formatEther(total)} ETH. ENS still requires commit, wait, then register.`
        );
      }
    } catch {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("ENS controller lookup is unavailable right now.");
      }
    }
  }

  async function checkEthSubnameRegistrationAvailability(cancelled = false): Promise<void> {
    if (!publicClient) {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("ENS registry lookup is unavailable right now.");
      }
      return;
    }

    const fullName = normalizeIdentityFullName(identityName, "register-eth-subname");
    const parts = fullName.split(".").filter(Boolean);
    if (parts.length < 3 || !fullName.endsWith(".eth")) {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("Enter a full .eth subname like music.artist.eth.");
      }
      return;
    }

    try {
      const current = await resolveEnsEffectiveOwner(publicClient, fullName);
      if (cancelled) return;
      if (String(current.owner).toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
        setCheckedIdentityReady(false);
        setLookupNote(`${fullName} is already registered in ENS. Use Link existing ENS subname instead.`);
        return;
      }

      const parentName = parts.slice(1).join(".");
      const parent = await resolveEnsEffectiveOwner(publicClient, parentName);
      if (cancelled) return;
      const parentOwner = String(parent.owner).toLowerCase();
      if (parentOwner === ZERO_ADDRESS.toLowerCase()) {
        setCheckedIdentityReady(false);
        setLookupNote(`${parentName} is not registered yet, so ${fullName} cannot be created under it.`);
        return;
      }
      if (!address || parentOwner !== address.toLowerCase()) {
        setCheckedIdentityReady(false);
        setLookupNote(`${parentName} exists, but the connected wallet does not control that parent name.`);
        return;
      }

      setCheckedIdentityReady(true);
      setLookupNote(
        `${fullName} can be created under ${parentName}, but external ENS subname creation is not fully wired here yet.`
      );
    } catch {
      if (!cancelled) {
        setCheckedIdentityReady(false);
        setLookupNote("ENS registry lookup is unavailable right now.");
      }
    }
  }

  async function checkNftFactoryIdentity(cancelled = false): Promise<void> {
    if (publicClient && config.subnameRegistrar) {
      try {
        const key = keccak256(stringToBytes(slug));
        const [owner, expiresAt, , exists] = await publicClient.readContract({
          address: config.subnameRegistrar as Address,
          abi: SUBNAME_REGISTRAR_ABI,
          functionName: "subnames",
          args: [key]
        });
        if (cancelled) return;

        const active =
          Boolean(exists) &&
          String(owner).toLowerCase() !== ZERO_ADDRESS.toLowerCase() &&
          BigInt(expiresAt) > BigInt(Math.floor(Date.now() / 1000));
        if (active) {
          setCheckedIdentityReady(false);
          setLookupNote(`${slug}.nftfactory.eth is already active on-chain. Choose a different label.`);
          return;
        }
      } catch {
        if (!cancelled) {
          setCheckedIdentityReady(false);
          setLookupNote("NFTFactory registrar lookup is unavailable right now.");
        }
        return;
      }
    }

    const requested = normalizedFullName;

    try {
      const resolution = await fetchProfileResolution(slug);
      if (cancelled) return;

      const exactProfileMatch = (resolution.profiles || []).some(
        (profile) => profile.fullName.trim().toLowerCase() === requested
      );
      const exactCollectionMatch = resolution.collections.some((collection) => {
        const rawName = String(collection.ensSubname || "").trim().toLowerCase();
        if (!rawName) return false;
        const fullName = rawName.includes(".") ? rawName : `${rawName}.nftfactory.eth`;
        return fullName === requested;
      });

      if (exactProfileMatch || exactCollectionMatch) {
        setCheckedIdentityReady(false);
        setLookupNote(`${requested} is already linked in NFTFactory and is not available here.`);
        return;
      }

      const walletCount = resolution.sellers.filter((item) => isAddress(item)).length;
      if (walletCount > 0) {
        setCheckedIdentityReady(false);
        setLookupNote(
          `${requested} is not linked directly, but /profile/${slug} already resolves to ${walletCount} wallet${walletCount === 1 ? "" : "s"}. Choose a different label if you need a distinct profile.`
        );
        return;
      }

      setCheckedIdentityReady(true);
      setLookupNote(`${requested} is available on-chain and is not currently linked in NFTFactory.`);
    } catch {
      if (!cancelled) {
        setCheckedIdentityReady(true);
        setLookupNote(`${requested} is available on-chain. NFTFactory link status could not be confirmed right now.`);
      }
    }
  }

  async function autoCheckIdentity(cancelled = false): Promise<void> {
    if (identityMode === "register-eth") {
      await checkEthRegistrationAvailability(cancelled);
      return;
    }
    if (identityMode === "register-eth-subname") {
      await checkEthSubnameRegistrationAvailability(cancelled);
      return;
    }
    if (identityMode === "nftfactory-subname") {
      await checkNftFactoryIdentity(cancelled);
      return;
    }
    await checkEnsRegistryIdentity(cancelled);
  }

  async function beginEthRegistration(): Promise<void> {
    if (!publicClient || !walletClient?.account || !ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS) {
      setSetupState({ status: "error", message: "ENS .eth registration is not configured here yet." });
      return;
    }
    if (wrongNetwork) {
      setSetupState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }

    const label = normalizeLabel(identityName.replace(/\.eth$/i, ""));
    if (!label || label.includes(".")) {
      setSetupState({ status: "error", message: "Enter a single .eth label like artist.eth." });
      return;
    }

    try {
      setPostLinkProfile(null);
      setPostLinkMintCta(false);
      const duration = BigInt(Number(registrationYears || "1") * 31536000);
      const minCommitmentAge = Number(
        await publicClient.readContract({
          address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
          abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
          functionName: "minCommitmentAge"
        })
      );
      const available = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "available",
        args: [label]
      });
      if (!available) {
        setSetupState({ status: "error", message: `${label}.eth is already registered in ENS.` });
        return;
      }

      const secret = createCommitmentSecret();
      const commitment = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "makeCommitment",
        args: [label, walletClient.account.address, duration, secret, ZERO_ADDRESS as Address, [], false, 0]
      });
      const [base, premium] = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [label, duration]
      });
      const total = BigInt(base) + BigInt(premium);
      const commitHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        data: encodeFunctionData({
          abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
          functionName: "commit",
          args: [commitment]
        })
      });
      await publicClient.waitForTransactionReceipt({ hash: commitHash });

      const nextPending: PendingEnsRegistration = {
        fullName: `${label}.eth`,
        label,
        durationYears: Number(registrationYears || "1"),
        durationSeconds: duration.toString(),
        secret,
        committedAt: Date.now(),
        minCommitmentAge,
        estimatedCostWei: total.toString(),
        commitHash
      };
      setPendingEnsRegistration(nextPending);
      if (address) {
        globalThis.localStorage.setItem(createEnsPendingKey(address), JSON.stringify(nextPending));
      }

      setSetupState({
        status: "success",
        hash: commitHash,
        message: `${label}.eth commit sent. Wait ${minCommitmentAge}s, then complete registration. Estimated ${registrationYears}-year cost: ${formatEther(
          total
        )} ETH.`
      });
    } catch (err) {
      setSetupState({
        status: "error",
        message: err instanceof Error ? err.message : "ENS controller lookup failed"
      });
    }
  }

  async function completeEthRegistration(): Promise<void> {
    if (!publicClient || !walletClient?.account || !ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS || !pendingEnsRegistration) {
      setSetupState({ status: "error", message: "ENS registration is not ready to complete." });
      return;
    }
    if (wrongNetwork) {
      setSetupState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }

    try {
      const duration = BigInt(pendingEnsRegistration.durationSeconds);
      const [base, premium] = await publicClient.readContract({
        address: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: "rentPrice",
        args: [pendingEnsRegistration.label, duration]
      });
      const total = BigInt(base) + BigInt(premium);
      const value = (total * 110n) / 100n;

      const registerHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: ENS_ETH_REGISTRAR_CONTROLLER_ADDRESS,
        data: encodeFunctionData({
          abi: ENS_ETH_REGISTRAR_CONTROLLER_ABI,
          functionName: "register",
          args: [
            pendingEnsRegistration.label,
            walletClient.account.address,
            duration,
            pendingEnsRegistration.secret,
            ZERO_ADDRESS as Address,
            [],
            false,
            0
          ]
        }),
        value
      });
      await publicClient.waitForTransactionReceipt({ hash: registerHash });

      const response = await linkProfileIdentity({
        name: pendingEnsRegistration.fullName,
        source: "ens",
        ownerAddress: walletClient.account.address,
        collectionAddress: selectedCollection || undefined,
        routeSlug: derivedRouteSlug || undefined
      });
      globalThis.localStorage.setItem(
        createPrimaryProfileKey(walletClient.account.address),
        JSON.stringify(response.profile)
      );

      const nextProfiles = dedupeProfiles([...profiles, response.profile]);
      setProfiles(nextProfiles);
      setPostLinkProfile(response.profile);
      setPostLinkMintCta(true);
      setIdentityName(response.profile.fullName);
      setPendingEnsRegistration(null);
      if (address) {
        globalThis.localStorage.removeItem(createEnsPendingKey(address));
      }
      setSetupState({
        status: "success",
        hash: registerHash,
        message: `${response.profile.fullName} registered in ENS and linked.`
      });
    } catch (err) {
      setSetupState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to complete ENS registration"
      });
    }
  }

  async function checkIdentityAvailability(): Promise<void> {
    if (!slug || !normalizedFullName) {
      setCheckedIdentityReady(false);
      setLookupNote("Enter a name first.");
      return;
    }
    await autoCheckIdentity();
  }

  async function linkIdentity(source: ApiProfileRecord["source"], options?: { launchMint?: boolean }): Promise<void> {
    if (!slug) {
      setSetupState({ status: "error", message: "Enter an ENS name, subdomain, or nftfactory label first." });
      return;
    }
    if (!address) {
      setSetupState({ status: "error", message: "Connect wallet first." });
      return;
    }

    if (source !== "nftfactory-subname" && publicClient) {
      try {
        const { owner } = await resolveEnsEffectiveOwner(
          publicClient,
          normalizeIdentityFullName(identityName, sourceToIdentityMode(source))
        );
        const ownerAddress = String(owner).toLowerCase();
        if (ownerAddress === ZERO_ADDRESS.toLowerCase()) {
          setSetupState({ status: "error", message: "This ENS name is not registered in the ENS registry." });
          return;
        }
        if (ownerAddress !== address.toLowerCase()) {
          setSetupState({ status: "error", message: "The connected wallet does not own this ENS name." });
          return;
        }
      } catch {
        setSetupState({ status: "error", message: "ENS registry lookup failed. Try again before linking this name." });
        return;
      }
    }

    try {
      setSetupState({ status: "pending", message: "Saving creator identity..." });
      setCheckedIdentityReady(false);
      setPostLinkProfile(null);
      setPostLinkMintCta(false);
      const response = await linkProfileIdentity({
        name: identityName,
        source,
        ownerAddress: address,
        collectionAddress: selectedCollection || undefined,
        routeSlug: derivedRouteSlug || undefined
      });
      globalThis.localStorage.setItem(createPrimaryProfileKey(address), JSON.stringify(response.profile));

      const nextProfiles = dedupeProfiles([...profiles, response.profile]);
      setProfiles(nextProfiles);
      setPostLinkProfile(response.profile);
      setPostLinkMintCta(Boolean(options?.launchMint));
      setSetupState({
        status: "success",
        message:
          source === "ens"
            ? `${response.profile.fullName} linked. Continue into shared mint to publish with this ENS identity.`
            : `${response.profile.fullName} linked to this creator profile.`
      });
    } catch (err) {
      setSetupState({ status: "error", message: err instanceof Error ? err.message : "Failed to save creator identity" });
    }
  }

  async function createNftFactorySubname(): Promise<void> {
    if (!slug) {
      setSetupState({ status: "error", message: "Enter a label first." });
      return;
    }
    if (!walletClient?.account) {
      setSetupState({ status: "error", message: "Connect wallet first." });
      return;
    }
    if (wrongNetwork) {
      setSetupState({ status: "error", message: `Select ${appChain.name} in the wallet menu first.` });
      return;
    }
    if (!publicClient) {
      setSetupState({ status: "error", message: "Public client unavailable. Reconnect wallet and try again." });
      return;
    }

    try {
      setSetupState({ status: "pending", message: `Creating ${slug}.nftfactory.eth...` });
      setCheckedIdentityReady(false);
      setPostLinkProfile(null);
      setPostLinkMintCta(false);
      const txHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: config.subnameRegistrar as Address,
        data: encodeRegisterSubname(slug) as Hex,
        value: BigInt(toHexWei(SUBNAME_FEE_ETH))
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });

      let nextProfile: ApiProfileRecord;
      try {
        const response = await linkProfileIdentity({
          name: slug,
          source: "nftfactory-subname",
          ownerAddress: walletClient.account.address,
          collectionAddress: selectedCollection || undefined,
          routeSlug: derivedRouteSlug || undefined
        });
        nextProfile = response.profile;
      } catch {
        nextProfile = createLocalProfileRecord({
          fullName: `${slug}.nftfactory.eth`,
          slug: derivedRouteSlug || slug,
          source: "nftfactory-subname",
          ownerAddress: walletClient.account.address,
          collectionAddress: selectedCollection || undefined
        });
      }
      globalThis.localStorage.setItem(
        createPrimaryProfileKey(walletClient.account.address),
        JSON.stringify(nextProfile)
      );

      const nextProfiles = dedupeProfiles([...profiles, nextProfile]);
      setProfiles(nextProfiles);
      setPostLinkProfile(nextProfile);
      setSetupState({
        status: "success",
        hash: txHash,
        message: `${nextProfile.fullName} created and linked.`
      });
    } catch (err) {
      setSetupState({ status: "error", message: err instanceof Error ? err.message : "Failed to create nftfactory subname" });
    }
  }

  function clearPendingEthRegistration(): void {
    if (address) {
      globalThis.localStorage.removeItem(createEnsPendingKey(address));
    }
    setPendingEnsRegistration(null);
    setRegistrationCountdown(0);
    setSetupState({ status: "idle" });
    setLookupNote("");
  }

  return (
    <section className="wizard">
      <div className="card formCard">
        <h3>Wallet</h3>
        <p className="hint">{address || "Connect a wallet from the header to link a creator profile."}</p>
        <p className="hint">Network: {appChain.name}</p>
        {wrongNetwork ? (
          <p className="hint">
            Use the header wallet button to select {appChain.name} before registering a .eth name or creating an
            nftfactory subname.
          </p>
        ) : null}
      </div>

      <div className="card formCard">
        <h3>Creator Identity</h3>
        <p className="sectionLead">
          Choose how this creator identity should be created or linked. By default, NFTFactory creates a{" "}
          <span className="mono">nftfactory.eth</span> subname unless you choose an ENS option instead.
        </p>
        {isConnected && profiles.length > 0 ? (
          <p className="hint">
            This wallet already has a linked profile. Identity actions here update the canonical name. Use{" "}
            <Link href={`/profile/${encodeURIComponent(profiles[0].slug)}`}>the profile page</Link> to edit display details.
          </p>
        ) : null}
        <div className="profileIdentityControlRow">
          <label className="profileIdentityControlLeft">
            Identity action
            <select
              value={identityMode}
              onChange={(e) =>
                setIdentityMode(
                  e.target.value as
                    | "register-eth"
                    | "register-eth-subname"
                    | "ens"
                    | "external-subname"
                    | "nftfactory-subname"
                )
              }
            >
              <optgroup label="Create New">
                <option value="nftfactory-subname">Create nftfactory.eth subname</option>
                <option value="register-eth">Register .eth</option>
                <option value="register-eth-subname">Register .eth subname</option>
              </optgroup>
              <optgroup label="Link Existing">
                <option value="ens">Link existing ENS</option>
                <option value="external-subname">Link existing ENS subname</option>
              </optgroup>
            </select>
          </label>
          <label className="profileIdentityControlCenter">
            {identityLabel}
            {identityMode === "register-eth-subname" ? (
              <>
                <div className="gridMini">
                  <label>
                    New subname label
                    <input value={identityName} onChange={(e) => setIdentityName(e.target.value)} />
                  </label>
                  <label>
                    Parent .eth name
                    <input value={subnameParent} onChange={(e) => setSubnameParent(e.target.value)} />
                  </label>
                </div>
                {normalizedFullName ? (
                  <p className="hint">
                    Full subname: <span className="mono">{normalizedFullName}</span>
                  </p>
                ) : null}
              </>
            ) : (
              <input value={identityName} onChange={(e) => setIdentityName(e.target.value)} />
            )}
          </label>
          <div className="profileIdentityControlRight">
            <span className="detailLabel">{checkedIdentityReady ? "Next action" : "Name check"}</span>
            <button
              type="button"
              className={checkedIdentityReady && identityMode !== "register-eth-subname" ? "profileActionReady" : undefined}
              onClick={() =>
                void (
                  checkedIdentityReady && identityMode !== "register-eth-subname"
                    ? runIdentityAction()
                    : checkIdentityAvailability()
                )
              }
              disabled={!slug || !normalizedFullName}
            >
              {checkedIdentityReady
                ? identityMode === "register-eth"
                  ? "Start registration"
                  : identityMode === "nftfactory-subname"
                    ? "Create now"
                    : identityMode === "register-eth-subname"
                      ? "Check parent ownership"
                      : "Link now"
                : identityMode === "register-eth"
                  ? "Check availability"
                  : identityMode === "nftfactory-subname"
                    ? "Check label"
                    : identityMode === "register-eth-subname"
                      ? "Check parent ownership"
                      : "Check in ENS"}
            </button>
          </div>
        </div>
        {identityMode === "register-eth" ? (
          <div className="gridMini">
            <label>
              Registration length
              <select value={registrationYears} onChange={(e) => setRegistrationYears(e.target.value)}>
                <option value="1">1 year</option>
                <option value="2">2 years</option>
                <option value="3">3 years</option>
                <option value="5">5 years</option>
              </select>
            </label>
          </div>
        ) : null}
        {identityMode === "register-eth" ? <p className="hint">Registration step: {ensRegistrationStep}</p> : null}
        {identityMode === "register-eth" && slug ? (
          <p className="hint">
            Target: <span className="mono">{normalizeLabel(identityName.replace(/\.eth$/i, ""))}.eth</span> for{" "}
            {registrationYears} year{registrationYears === "1" ? "" : "s"}.
          </p>
        ) : null}
        <div className="gridMini">
          <label>
            Linked collection (optional)
            <select value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}>
              <option value="">No collection linked</option>
              {verifiedCollections.map((collection) => (
                <option key={collection.contractAddress} value={collection.contractAddress}>
                  {collection.ensSubname?.trim() || collection.contractAddress}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">{identityHint}</p>
        {identityMode === "register-eth" && pendingEnsRegistration ? (
          <div className="row">
            <button
              type="button"
              onClick={() => void completeEthRegistration()}
              disabled={!isConnected || setupState.status === "pending" || wrongNetwork || registrationCountdown > 0}
            >
              {setupState.status === "pending"
                ? "Working..."
                : registrationCountdown > 0
                  ? `Wait ${registrationCountdown}s`
                  : "Complete registration"}
            </button>
            <button type="button" className="secondary" onClick={clearPendingEthRegistration}>
              Reset pending
            </button>
          </div>
        ) : null}
        <p className="hint">
          {derivedRouteSlug
            ? `Profile route: /profile/${derivedRouteSlug}`
            : "Profile routes use reversed ENS labels like /profile/eth.artist, and plain labels for nftfactory subnames."}
        </p>
        {identityMode === "register-eth" && pendingEnsRegistration ? (
          <p className="hint">
            Pending commit: {pendingEnsRegistration.fullName}.{" "}
            Estimated register cost: {formatEther(BigInt(pendingEnsRegistration.estimatedCostWei))} ETH.{" "}
            {registrationCountdown > 0
              ? `You can complete registration in ${registrationCountdown}s.`
              : "You can now complete the register transaction."}
          </p>
        ) : null}
        {identityStatusText ? <p className={checkedIdentityReady ? "success" : "hint"}>{identityStatusText}</p> : null}
        {lookupNote ? <p className="hint">{lookupNote}</p> : null}
        {setupState.status === "error" ? <p className="error">{setupState.message}</p> : null}
        {setupState.status === "pending" ? <p className="hint">{setupState.message}</p> : null}
        {setupState.status === "success" ? (
          <>
            <p className="success">
              {setupState.message}{" "}
              {setupState.hash ? (
                explorerBase ? (
                  <a href={`${explorerBase}/tx/${setupState.hash}`} target="_blank" rel="noreferrer">
                    {truncateHash(setupState.hash)}
                  </a>
                ) : (
                  <span className="mono">{truncateHash(setupState.hash)}</span>
                )
              ) : null}
            </p>
            {postLinkProfile ? (
              <div className="row">
                <Link href={`/profile/${encodeURIComponent(postLinkProfile.slug)}`} className="ctaLink">
                  Open /profile/{postLinkProfile.slug}
                </Link>
                {postLinkMintCta ? (
                  <Link
                    href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(postLinkProfile.fullName)}`}
                    className="ctaLink"
                  >
                    Continue to mint
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
