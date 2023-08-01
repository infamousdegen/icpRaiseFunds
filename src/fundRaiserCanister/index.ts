import { $query, $update,$init, Record, StableBTreeMap, 
     match, Result, nat,nat64, ic, Opt,Principal, blob, int8,Vec } from 'azle';

import {
    Address,
    binaryAddressFromPrincipal,
    hexAddressFromPrincipal,
    binaryAddressFromAddress,
    Ledger,
} from 'azle/canisters/ledger';

import {Token, addressPayload, donatePayload, queryPayload, updateDurationPayload, updateFeesPayload, updateVaultPayload, withdrawPayload } from '../types';

type initFundPayload = Record <{
    amount: nat;
    addressRecepient: Principal;
    duration: nat;
}>

type Message = Record<{
    id: nat;
    amount: nat;
    totalAmountFunded: nat;
    addressRaiser: Principal;
    addressRecepient: Principal;
    createdAt: nat64;
    expiry: nat64;
    active:boolean
}>

const FundStorage = new StableBTreeMap<string, Message>(0, 44, 1024);

let tokenCanister:Token

// enter fund raiser canister address
let fundRaiserCanister:string; 

//temporarily
const icpCanister = new Ledger(
    Principal.fromText("bkyz2-fmaaa-aaaaa-qaaaq-cai")
);

let owner: Principal;
let vault: Principal;
let fees: nat;
let id: nat;
let network: int8;


//This function will deploy the canister locally 

$update;
export function initialise(_network:int8,tokenAddress:string):void{
    owner = ic.caller();
    vault = ic.caller();
    fees = 0n;
    id = 0n;
    
    tokenCanister = new Token(Principal.fromText(tokenAddress));

    fundRaiserCanister = ic.id().toString();

    if(_network == 0){
        network = 0;
    }else if(_network == 1){
        network =1;

    }
    else{
        ic.trap("Invalid network option choose 0 or 1")
    }
}


$update;
export async function initializeBalance(): Promise<Result<string, string>>{

    // set up network for testing
    if (network == 0){

        const returnValue = await tokenCanister.initializeSupply('ICToken', fundRaiserCanister, 'ICT', 1_000_000_000_000n).call();
        if (returnValue.Ok){
            return Result.Ok<string,string>("Fund initialised")
        }
        else if(returnValue.Err){
            return Result.Err<string,string>(returnValue.Err)
        }
    }
    return Result.Err<string, string>(`network is set to ${network}`);
}

$update;
export function updateVaultAddress(payload: updateVaultPayload) :Result<string,string> {
    if(ic.caller() == owner){
        vault = payload.address;
        return(Result.Ok(vault.toString()));
    }
    throw `Method "${ic.methodName()}" cannot be called by you `;
}

$update
export function updateFees(payload: updateFeesPayload) : Result<nat,string> {
    if(ic.caller() == owner){
        fees = payload.newFees;
        return(Result.Ok(fees))
    }
    throw `Method "${ic.methodName()}" cannot be called by you `;
}

//If you are the owner of the fundyou can update the duration to any arbitrary value from the time of the creation
//Duration has to be in nanoseconds of unix time stamp
$update 
export function updateDuration(payload: updateDurationPayload): Result<Message,string>{
    return match(FundStorage.get(payload.id.toString()),{
        Some:(message) =>{
            
            if(message.addressRaiser.toString() != ic.caller().toString()){
                ic.trap("You are not the owner of this id");
            }
            
            const updateMessage = {...message, expiry : message.createdAt + payload.duration};
            FundStorage.insert(payload.id.toString(), updateMessage);
            return Result.Ok<Message,string>(updateMessage);
        },

        None: () => Result.Err<Message,string>("Id not found")
    })
}

//@note: To start a new fund 
$update
export function createNewFund(payload: initFundPayload) : Result<Message, string> {
    let expiryForThis = ic.time() + payload.duration;
    let caller = ic.caller();
    const message : Message = {
        id: id,
        addressRaiser: caller,
        createdAt: ic.time(),
        expiry: expiryForThis,
        active:true, 
        totalAmountFunded: 0n,
        ...payload
    };

    id++;
    FundStorage.insert(message.id.toString(), message);
    return(Result.Ok(message));    
}

//@note:to pause a fund
$update
export function pauseFund(payload: queryPayload) :Result<Message,string>{
    return match(FundStorage.get(payload.id.toString()),{
        Some:(message) =>{
            
            if(message.addressRaiser.toString() != ic.caller().toString()){
                ic.trap(`Raiser = ${message.addressRaiser.toUint8Array()}  caller = ${ic.caller().toUint8Array()}`);
            }
            
            const updateMessage = {...message, active : false};
            FundStorage.insert(payload.id.toString(),updateMessage)
            return Result.Ok<Message,string>(message);
        },

        None: () => Result.Err<Message,string>("Id not found")
    })
}

//@note: To restart a fund
$update
export function restartFund(payload: queryPayload) :Result<Message,string>{
    return match(FundStorage.get(payload.id.toString()),{
        Some:(message) =>{
            
            if(message.addressRaiser.toString() != ic.caller().toString()){
                ic.trap("You are not the owner of this id");
            }
            
            const updateMessage = {...message, active : true};
            FundStorage.insert(payload.id.toString(), updateMessage)
            return Result.Ok<Message,string>(message);
        },
        None: () => Result.Err<Message,string>("Id not found")
    })
}

$update
export async function donate(payload: donatePayload): Promise<Result<string,string>>{
    return match(FundStorage.get(payload.id.toString()),{
        Some: async(message) =>{
            if(message.active === false || message.expiry < ic.time()){
                throw `Either fund is not active or expiry has passed   `; 
            }

            // if network is set to local network use dummy tokens
            if(network == 0){
                let status = (await tokenCanister.transfer(ic.caller().toString(), fundRaiserCanister, payload.amount).call()).Ok;   
                if(!status){
                    ic.trap("Failed to Donate")
                }
            } else {
                const toSubAccount: blob = binaryAddressFromPrincipal(ic.id(),Number(id))
                const uniqueNumber = generateUniqueNumber(ic.caller())
                const fromSubAccount: blob = binaryAddressFromPrincipal(ic.id(),uniqueNumber)
                const balance  = (await icpCanister.account_balance({account:fromSubAccount}).call()).Ok?.e8s
                
                if(balance !== undefined){
                    const transfer = await icpCanister.transfer(
                        {
                            memo: 0n,
                            amount: {
                                e8s: balance
                            },
                            fee:{
                                e8s: 10000n
                            },
                            from_subaccount: Opt.Some(fromSubAccount),
                            to: toSubAccount,
                            created_at_time: Opt.None
                        }
                    ).call()

                    if(transfer.Err){
                        ic.trap(transfer.Err.toString())
                    }
                } else{
                    ic.trap("Fund the subAccount first")
                }
            }

            // update storage
            const updateMessage = {...message, totalAmountFunded: message.totalAmountFunded + payload.amount};
            FundStorage.insert(payload.id.toString(),updateMessage);           
            return Result.Ok<string,string>("Funded");
        },

        None: () => Result.Err<string,string>("Id not found")
    })
}

$update
export async function withdrawFund(payload: withdrawPayload) :  Promise<Result<string, string>> {
    return(match(FundStorage.get(payload.id.toString()),{
        Some: async(message) =>{
            if(ic.caller().toString() != message.addressRecepient.toString()){
                ic.trap("You cannot withdraw")
            }

            if(message.amount > message.totalAmountFunded){
                ic.trap("Target has not been reached")
            }

            // if network is set to local network use dummy tokens
            if (network == 0){
                let status = (await tokenCanister.transfer(fundRaiserCanister, payload.transferAddress, message.amount).call()).Ok;   
                if(!status){
                    ic.trap("Failed to Donate")
                }
            }else{
                let subAccount: blob = binaryAddressFromPrincipal(ic.id(),Number(id))
                const transferResult = await icpCanister.transfer(
                    {
                        memo: 0n,
                        amount: {
                            e8s: message.amount
                        },
                        fee:{
                            e8s: 10000n
                        },
                        from_subaccount: Opt.Some(subAccount),
                        to: binaryAddressFromAddress(payload.transferAddress),
                        created_at_time: Opt.None
                    }
                ).call()

                if(transferResult.Err){
                    ic.trap(transferResult.Err.toString())
                }
            }
            
            const updateMessage = {...message, amount : 0n};
            FundStorage.insert(payload.id.toString(), updateMessage);
            return Result.Ok<string,string>("WithdrewFund");
        },
        None: () => Result.Err<string,string>("Id not found")
    }))
}

$update
export async function checkRaised(payload: queryPayload): Promise<Result<nat, string>>{
    return(match(FundStorage.get(payload.id.toString()),{
        Some: async(message) => {
            // if network is set to local network use dummy tokens
            if (network == 0){
                return Result.Ok<nat,string>(message.totalAmountFunded)
            }else{
                let subAccount: blob = binaryAddressFromPrincipal(ic.id(),Number(id))
                
                const balance  = (await icpCanister.account_balance({account:subAccount}).call()).Ok?.e8s
                if(balance !== undefined){
                    return Result.Ok<nat,string>(balance)
                }
                else{
                    return Result.Ok<nat,string>(0n)
                }
            }
        },
        None: () => Result.Err<nat,string>("Id not found")
    }))
}

$query
export function getAllCanisters():Result<Vec<Message>,string> {
    return Result.Ok(FundStorage.values())
}
$query
export function getAddressToDeposit():Address {
    const uniqueNumber = generateUniqueNumber(ic.caller())
    const address: Address = hexAddressFromPrincipal(ic.id(),uniqueNumber)
    return(address)
}

function generateUniqueNumber(principal: Principal): number {
    const uint8Array = principal.toUint8Array();  
    const bigIntValue = BigInt("0x" + Array.from(uint8Array).map(byte => byte.toString(16).padStart(2, "0")).join(""));
    const uniqueNumber = Number(bigIntValue);
    return uniqueNumber;
}

// Helper functions
$update
export async function getFaucetTokens(): Promise<Result<boolean, string>>{
    const caller = ic.caller();
    const returnVal = (await tokenCanister.balance(caller.toString()).call()).Ok;
    const balance = returnVal? returnVal : 0n;
    if(balance > 0n){
        ic.trap("To prevent faucet drain, please utilize your existing tokens");
    }
    return await tokenCanister.transfer(fundRaiserCanister, caller.toString(), 100n).call();   
}

$update;
export async function walletBalance(payload: addressPayload): Promise<Result<nat64, string>> {
    let address = payload.address
    if(address == ""){
        address = ic.caller().toString();
    }
    return await tokenCanister.balance(address).call();
}