import {
  $query,
  $update,
  $init,
  Record,
  StableBTreeMap,
  match,
  Result,
  nat,
  nat64,
  ic,
  Opt,
  Principal,
  blob
} from 'azle';

import {
  Address,
  binaryAddressFromPrincipal,
  hexAddressFromPrincipal,
  binaryAddressFromAddress,
  Ledger,
} from 'azle/canisters/ledger';

type initFundPayload = Record<{
  amount: nat;
  addressRecipient: Principal;
  duration: nat64;
}>;

type Message = Record<{
  id: nat;
  amount: nat;
  addressRaiser: Principal;
  addressRecipient: Principal;
  createdAt: nat64;
  expiry: nat64;
  active: boolean;
}>;

const FundStorage = new StableBTreeMap<string, Message>(0, 44, 1024);
const userBalance = new StableBTreeMap<Principal, nat>(1, 32, 1000);
const icpCanister = new Ledger(
  Principal.fromText("utozz-siaaa-aaaam-qaaxq-cai")
);

let owner: Principal = ic.caller();
let vault: Principal = ic.caller();
let fees: nat = 0n;
let id: nat = 0n;

$init
export function initialize(): void {
  fees = 0n;
  id = 0n;
}

$update
export function updateVaultAddress(address: Principal): Result<string, string> {
  if (ic.caller() === owner) {
    vault = address;
    return Result.Ok(vault.toString());
  }
  return Result.Err(`Method "${ic.methodName()}" cannot be called by you`);
}

$update
export function updateFees(newFees: nat): Result<nat, string> {
  if (ic.caller() === owner) {
    fees = newFees;
    return Result.Ok(fees);
  }
  return Result.Err(`Method "${ic.methodName()}" cannot be called by you`);
}

$update
export function updateDuration(id: nat, duration: nat64): Result<Message, string> {
  const message = FundStorage.get(id.toString());
  if (message !== null) {
    if (message.addressRaiser !== ic.caller()) {
      return Result.Err("You are not the owner of this id");
    }
    const updatedMessage = { ...message, expiry: message.createdAt + duration };
    FundStorage.insert(id.toString(), updatedMessage);
    return Result.Ok(updatedMessage);
  }
  return Result.Err("Id not found");
}

$update
export function createNewFund(payload: initFundPayload): Result<Message, string> {
  const expiryForThis = ic.time() + payload.duration;
  const message: Message = {
    id: id,
    addressRaiser: ic.caller(),
    createdAt: ic.time(),
    expiry: expiryForThis,
    active: true,
    ...payload
  };
  id++;
  FundStorage.insert(message.id.toString(), message);
  return Result.Ok(message);
}

$update
export function pauseFund(id: nat): Result<Message, string> {
  const message = FundStorage.get(id.toString());
  if (message !== null) {
    if (message.addressRaiser !== ic.caller()) {
      return Result.Err("You are not the owner of this id");
    }
    const updatedMessage = { ...message, active: false };
    FundStorage.insert(id.toString(), updatedMessage);
    return Result.Ok(updatedMessage);
  }
  return Result.Err("Id not found");
}

$update
export function restartFund(id: nat): Result<Message, string> {
  const message = FundStorage.get(id.toString());
  if (message !== null) {
    if (message.addressRaiser !== ic.caller()) {
      return Result.Err("You are not the owner of this id");
    }
    const updatedMessage = { ...message, active: true };
    FundStorage.insert(id.toString(), updatedMessage);
    return Result.Ok(updatedMessage);
  }
  return Result.Err("Id not found");
}

$update
export async function donate(id: nat): Promise<Result<string, string>> {
  const message = FundStorage.get(id.toString());
  if (message !== null) {
    if (!message.active || message.expiry < ic.time()) {
      return Result.Err("Either fund is not active or expiry has passed");
    }

    const toSubAccount: blob = binaryAddressFromPrincipal(ic.id(), Number(id));
    const uniqueNumber = generateUniqueNumber(ic.caller());
    const fromSubAccount: blob = binaryAddressFromPrincipal(ic.id(), uniqueNumber);
    const balance = (await icpCanister.account_balance({ account: fromSubAccount }).call()).Ok?.e8s;

    if (balance !== undefined) {
      const transfer = await icpCanister.transfer({
        memo: 0n,
        amount: { e8s: balance },
        fee: { e8s: 10000n },
        from_subaccount: Opt.Some(fromSubAccount),
        to: toSubAccount,
        created_at_time: Opt.None
      }).call();

      if (transfer.Err) {
        return Result.Err(transfer.Err.toString());
      }
    } else {
      return Result.Err("Fund the subAccount first");
    }

    return Result.Ok("Funded");
  }
  return Result.Err("Id not found");
}

$update
export async function withdrawFund(id: nat, transferAddress: Address): Promise<Result<string, string>> {
  const message = FundStorage.get(id.toString());
  if (message !== null) {
    if (ic.caller() !== message.addressRecipient) {
      return Result.Err("You cannot withdraw");
    }
    const subAccount: blob = binaryAddressFromPrincipal(ic.id(), Number(id));
    const transferResult = await icpCanister.transfer({
      memo: 0n,
      amount: { e8s: message.amount },
      fee: { e8s: 10000n },
      from_subaccount: Opt.Some(subAccount),
      to: binaryAddressFromAddress(transferAddress),
      created_at_time: Opt.None
    }).call();

    if (transferResult.Err) {
      return Result.Err(transferResult.Err.toString());
    }

    const updatedMessage = { ...message, amount: 0n };
    FundStorage.insert(id.toString(), updatedMessage);
    return Result.Ok("Withdrawn Fund");
  }
  return Result.Err("Id not found");
}

$query
export async function checkRaised(id: nat): Promise<Result<nat, string>> {
  const message = FundStorage.get(id.toString());
  if (message !== null) {
    const subAccount: blob = binaryAddressFromPrincipal(ic.id(), Number(id));
    const balance = (await icpCanister.account_balance({ account: subAccount }).call()).Ok?.e8s;
    return Result.Ok<nat, string>(balance !== undefined ? balance : 0n);
  }
  return Result.Err("Id not found");
}

$query
export function getAddressToDeposit(): Address {
  const uniqueNumber = generateUniqueNumber(ic.caller());
  const address: Address = hexAddressFromPrincipal(ic.id(), uniqueNumber);
  return address;
}

function generateUniqueNumber(principal: Principal): number
