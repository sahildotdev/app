import uniswapTokenList from '@uniswap/default-token-list';
import type { TokenInfo } from '@uniswap/token-lists';
import { get, writable } from 'svelte/store';
import * as storedTokens from './stored-custom-tokens';
import assert from '$lib/utils/assert';
import { Utils } from 'radicle-drips';
import { browser } from '$app/environment';

interface DefaultTokenInfoWrapper {
  info: TokenInfo;
  source: 'default';
}

export interface CustomTokenInfoWrapper {
  info: TokenInfo;
  source: 'custom';
  banned: boolean;
}

export type TokenInfoWrapper = DefaultTokenInfoWrapper | CustomTokenInfoWrapper;

export default (() => {
  let chainId: number | undefined;
  const tokenList = writable<TokenInfoWrapper[] | undefined>();
  const connected = writable(false);

  /**
   * Connect the store to a chain, which is required before any other
   * functionality can be used.
   * @param toChainId The ID of the chain to serve tokens for.
   */
  function connect(toChainId: number) {
    chainId = toChainId;

    const customTokens = browser
      ? storedTokens.readCustomTokensList().filter((t) => t.info.chainId === chainId)
      : [];

    const defaultTokens: TokenInfoWrapper[] = uniswapTokenList.tokens
      .filter((t) => t.chainId === chainId)
      .map((t) => ({
        info: t,
        source: 'default',
      }));

    tokenList.set([...defaultTokens, ...customTokens]);

    connected.set(true);
  }

  /**
   * Disconnect the store from the connected chain, and clear it completely. Any custom
   * tokens persisted in localstorage will be restored on next call to `connect`.
   */
  function disconnect() {
    chainId = undefined;
    tokenList.set(undefined);
    connected.set(false);
  }

  /**
   * Retrieve token information for a given token by its address.
   * @param address The contract address of the token to retrieve information for.
   * @param chain The chain ID to retrieve the token information for. Defaults to the
   * chain the store is connected to.
   * @returns Token information, or undefined if not found.
   */
  function getByAddress(address: string, chain = chainId): TokenInfoWrapper | undefined {
    const tokens = get(tokenList);
    if (!tokens) return;

    return tokens.find((t) => {
      const addressMatch = t.info.address.toLowerCase() === address.toLowerCase();
      const chainIdMatch = t.info.chainId === chain;

      return addressMatch && chainIdMatch;
    });
  }

  /**
   * Retrieve token information for a given token by its symbol.
   * @param symbol The symbol of the token to retrieve information for.
   * @param chain The chain ID to retrieve the token information for. Defaults to the
   * chain the store is connected to.
   * @returns Token information, or undefined if not found.
   */
  function getBySymbol(symbol: string, chain = chainId): TokenInfoWrapper | undefined {
    const tokens = get(tokenList);
    if (!tokens) return;

    return tokens.find((t) => {
      const symbolMatch = t.info.symbol.toLowerCase() === symbol.toLowerCase();
      const chainIdMatch = t.info.chainId === chain;

      return symbolMatch && chainIdMatch;
    });
  }

  /**
   * Retrieve token information for a given token by its Drips `asset ID` (which is a
   * hexadecimal representation of its address).
   * @param dripsAssetId The drips asset ID of the token to retrieve information for.
   * @param chain The chain ID to retrieve the token information for. Defaults to the
   * chain the store is connected to.
   * @returns Token information, or undefined if not found.
   */
  function getByDripsAssetId(dripsAssetId: string, chain = chainId): TokenInfoWrapper | undefined {
    const tokens = get(tokenList);
    if (!tokens) return;

    return tokens.find((t) => {
      const assetAddress = Utils.Asset.getAddressFromId(BigInt(dripsAssetId));

      const addressMatch = t.info.address.toLowerCase() === assetAddress.toLowerCase();
      const chainIdMatch = t.info.chainId === chain;

      return addressMatch && chainIdMatch;
    });
  }

  /**
   * Add a new custom token if said token is not part of the default list. Custom tokens
   * are persisted in localstorage. Once called, the custom token will be included in the
   * store state, provided it matches the current chainId.
   * @param tokenInfo An object containing all of the required metadata for persisting the
   * custom token.
   */
  function addCustomToken(tokenInfo: TokenInfo) {
    const tokens = get(tokenList);
    if (!tokens) return;

    assert(
      !tokens.find((t) => t.info.address === tokenInfo.address),
      'This custom token already exists',
    );

    storedTokens.createCustomToken(tokenInfo);

    if (tokenInfo.chainId !== chainId) return;

    tokenList.update(() => [
      ...tokens,
      {
        info: tokenInfo,
        source: 'custom',
        banned: false,
      },
    ]);
  }

  /**
   * Removes a previously-created custom token from the persisted custom token list. Once
   * called, the token disappears from the store state and is erased from localstorage.
   * @param address The address of the custom token to remove.
   * @param chainId The chain ID of the custom token to remove.
   */
  function removeCustomToken(address: string, chainId: number) {
    let tokens = get(tokenList);
    if (!tokens) return;

    const token = getByAddress(address, chainId);
    assert(
      token && token.source === 'custom',
      `Unable to find custom token with address ${address} on chain ${chainId}`,
    );

    storedTokens.deleteCustomToken(token);

    tokens = tokens.filter(
      (v) => v.info.address.toLowerCase() !== token.info.address.toLowerCase(),
    );
    tokenList.set(tokens);
  }

  /**
   * Ban or un-ban a custom token. Banning a custom token adds a `banned = true` field to its
   * token info, which is intended to denote that said token should generally be hidden across
   * the application.
   * @param address The address of the token to ban / un-ban.
   * @param chainId The chain ID of the token to ban / un-ban.
   * @param banned True if the token should be banned, false if un-banned.
   */
  function setCustomTokenBanStatus(address: string, chainId: number, banned: boolean) {
    const tokens = get(tokenList);
    if (!tokens) return;

    const token = getByAddress(address, chainId);
    assert(
      token && token.source === 'custom',
      `Unable to find custom token with address ${address}`,
    );

    const newValue = {
      ...token,
      banned,
    };

    storedTokens.updateCustomToken(address, newValue);

    tokens.splice(tokens.indexOf(token), 1, newValue);
    tokenList.set(tokens);
  }

  return {
    subscribe: tokenList.subscribe,
    connect,
    disconnect,
    connected: { subscribe: connected.subscribe },
    getByAddress,
    getBySymbol,
    getByDripsAssetId,
    addCustomToken,
    removeCustomToken,
    setCustomTokenBanStatus,
  };
})();
