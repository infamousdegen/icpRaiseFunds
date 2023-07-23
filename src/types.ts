import {
    CallResult,
    nat64,
    Service,
    Record,
    serviceQuery,
    serviceUpdate,
    Principal,
    int8,
    nat,
} from 'azle';

export type addressPayload = Record<{
    address: string
}>

export type donatePayload = Record<{
    id: nat;
    amount: nat;
}>

export type queryPayload = Record<{
    id: nat;
}>

export type withdrawPayload = Record<{
    id:nat;
    transferAddress: string
}>

export type updateDurationPayload = Record<{
    id: nat; 
    duration: nat64;
}>

export type updateFeesPayload = Record<{
    newFees: nat
}>

export type updateVaultPayload = Record<{
    address: Principal;
}>

export type initPayload = Record<{
    // network: local:0 or mainnet:1
    network: int8
}>

export type Account = {
    address: string;
    balance: nat64;
};

export type State = {
    accounts: {
        [key: string]: Account;
    };
    name: string;
    ticker: string;
    totalSupply: nat64;
};


export class Token extends Service {
    @serviceUpdate
    initializeSupply: ( name: string, originalAddress: string, ticker: string,totalSupply: nat64) => CallResult<boolean>;

    @serviceUpdate
    transfer: (from: string, to: string, amount: nat64) => CallResult<boolean>;

    @serviceQuery
    balance: (id: string) => CallResult<nat64>;

    @serviceQuery
    ticker: () => CallResult<string>;

    @serviceQuery
    name: () => CallResult<string>;

    @serviceQuery
    totalSupply: () => CallResult<nat64>;
}
