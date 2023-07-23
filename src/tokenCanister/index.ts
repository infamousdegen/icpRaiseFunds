import { nat64, $query, $update, ic } from 'azle';
import { State } from '../types';

let state: State = {
    accounts: {},
    name: '',
    ticker: '',
    totalSupply: 0n
};

$update;
export function initializeSupply(
    name: string,
    originalAddress: string,
    ticker: string,
    totalSupply: nat64
): boolean {
    state = {
        ...state,
        accounts: {
            [originalAddress]: {
                address: originalAddress,
                balance: totalSupply
            }
        },
        name,
        ticker,
        totalSupply
    };

    return true;
}

$update;
export function transfer(
    fromAddress: string,
    toAddress: string,
    amount: nat64
): boolean {
    if (state.accounts[toAddress] === undefined) {
        state.accounts[toAddress] = {
            address: toAddress,
            balance: 0n
        };
    }

    if (state.accounts[fromAddress] === undefined) {
        state.accounts[fromAddress] = {
            address: fromAddress,
            balance: 0n
        };
    }
    const fromBalance = state.accounts[fromAddress].balance;

    if (fromBalance < amount) {
        ic.trap("Insufficient amount")
    }

    state.accounts[fromAddress].balance -= amount;
    state.accounts[toAddress].balance += amount;

    return true;
}

$query;
export function balance(address: string): nat64 {
    return state.accounts[address]?.balance ?? 0n;
}

$query;
export function ticker(): string {
    return state.ticker;
}

$query;
export function name(): string {
    return state.name;
}

$query;
export function totalSupply(): nat64 {
    return state.totalSupply;
}
