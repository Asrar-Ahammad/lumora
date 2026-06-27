"use client"

import * as React from "react"
import { useAuth } from "@clerk/nextjs"
import { deriveKey, decryptNodeKey } from "@/lib/crypto"

type EncryptedNodeInfo = {
  id: string;
  parentId: string | null;
  nodeKeyEnc: string;
  nodeKeyIV: string;
};

type CryptoContextType = {
  cryptoKey: CryptoKey | null;
  recoveryCode: string | null;
  setRecoveryCode: (code: string) => Promise<void>;
  isReady: boolean;
  nodeKeysCache: React.MutableRefObject<Map<string, CryptoKey>>;
  decryptNodeKeyCascade: (
    node: EncryptedNodeInfo,
    ancestors: Map<string, EncryptedNodeInfo>
  ) => Promise<CryptoKey>;
};

const CryptoContext = React.createContext<CryptoContextType>({
  cryptoKey: null,
  recoveryCode: null,
  setRecoveryCode: async () => {},
  isReady: false,
  nodeKeysCache: { current: new Map() },
  decryptNodeKeyCascade: async () => { throw new Error("Context not ready") },
});

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const [cryptoKey, setCryptoKey] = React.useState<CryptoKey | null>(null);
  const [recoveryCode, setRecoveryCodeState] = React.useState<string | null>(null);
  const [isReady, setIsReady] = React.useState(false);
  const nodeKeysCache = React.useRef<Map<string, CryptoKey>>(new Map());

  // Clear cache if user or recovery code changes
  React.useEffect(() => {
    nodeKeysCache.current.clear();
    setCryptoKey(null);
    setIsReady(false);
  }, [userId, recoveryCode]);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setIsReady(true);
      return;
    }

    async function initKey() {
      try {
        const codeToUse = recoveryCode || userId;
        if (!codeToUse) return;

        const res = await fetch(`/api/auth/salt?targetId=${encodeURIComponent(codeToUse)}`);
        const { salt } = await res.json();

        if (salt) {
          const key = await deriveKey(codeToUse, salt);
          setCryptoKey(key);
        }
      } catch (err) {
        console.error("Failed to derive key", err);
      } finally {
        setIsReady(true);
      }
    }

    initKey();
  }, [isLoaded, userId, recoveryCode]);

  const setRecoveryCode = async (code: string) => {
    setRecoveryCodeState(code);
  };

  const decryptNodeKeyCascade = React.useCallback(
    async (
      node: EncryptedNodeInfo,
      ancestors: Map<string, EncryptedNodeInfo>
    ): Promise<CryptoKey> => {
      // 1. Check Cache
      if (nodeKeysCache.current.has(node.id)) {
        return nodeKeysCache.current.get(node.id)!;
      }

      let decryptedKey: CryptoKey;

      if (!node.parentId) {
        // 2. Root node - decrypted with User's Root Key
        if (!cryptoKey) {
          throw new Error("User Root Key not derived yet.");
        }
        decryptedKey = await decryptNodeKey(node.nodeKeyEnc, cryptoKey, node.nodeKeyIV);
      } else {
        // 3. Child node - needs Parent's Key
        const parentNode = ancestors.get(node.parentId);
        if (!parentNode) {
          throw new Error(`Missing parent metadata for parentId: ${node.parentId}`);
        }
        // Recursively decrypt parent
        const parentKey = await decryptNodeKeyCascade(parentNode, ancestors);
        decryptedKey = await decryptNodeKey(node.nodeKeyEnc, parentKey, node.nodeKeyIV);
      }

      // 4. Cache it
      nodeKeysCache.current.set(node.id, decryptedKey);
      return decryptedKey;
    },
    [cryptoKey]
  );

  return (
    <CryptoContext.Provider
      value={{
        cryptoKey,
        recoveryCode,
        setRecoveryCode,
        isReady: isReady && (!userId || cryptoKey !== null),
        nodeKeysCache,
        decryptNodeKeyCascade,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
}

export const useCrypto = () => React.useContext(CryptoContext);

