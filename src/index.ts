import { $query, $update,$init, Record, StableBTreeMap, 
     match, Result, nat,nat64, ic, Opt,Principal, blob } from 'azle';


import {
    Address,

    binaryAddressFromPrincipal,

    hexAddressFromPrincipal,
    binaryAddressFromAddress,
    Ledger,

} from 'azle/canisters/ledger';




type initFundPayload = Record <{
    amount: nat;
    addressRecepient: Principal;
    duration: nat64;

}>

type Message = Record<{
    id: nat;
    amount: nat;
    addressRaiser: Principal;
    addressRecepient: Principal;
    createdAt: nat64;
    expiry: nat64;
    active:boolean
}>





const FundStorage = new StableBTreeMap<string, Message>(0, 44, 1024);

const userBalance = new StableBTreeMap<Principal,nat>(1,32,1000);


const icpCanister = new Ledger(
    Principal.fromText("utozz-siaaa-aaaam-qaaxq-cai"
    )
);


let owner :Principal;
let vault :Principal;
let fees:nat;
let id:nat;

$init;
export function initialize():void{
    owner = ic.caller();
    vault = ic.caller();
    fees = 0n;
    id = 0n;
}




$update;
export function updateVaultAddress(address:Principal) :Result<string,string> {
    if(ic.caller() == owner){
        vault = address;
        return(Result.Ok(vault.toString()));
    }
    throw `Method "${ic.methodName()}" cannot be called by you `;
}

$update
export function updateFees(newFees:nat) : Result<nat,string> {
    if(ic.caller() == owner){
        fees = newFees;
        return(Result.Ok(fees))
    }
    throw `Method "${ic.methodName()}" cannot be called by you `;
}

//If you are the owner of the fundyou can update the duration to any arbitrary value from the time of the creation
//Duration has to be in nanoseconds of unix time stamp
$update 
export function updateDuration(id: nat,duration:nat64) :Result<Message,string>{
    return match(FundStorage.get(id.toString()),{
        Some:(message) =>{
            if(message.addressRaiser != ic.caller()){
                ic.trap("You are not the owner of this id");
            }
            const updateMessage = {...message,expiry : message.createdAt + duration};
            FundStorage.insert(id.toString(),updateMessage)
            return Result.Ok<Message,string>(updateMessage);
        },

        None: () => Result.Err<Message,string>("Id not found")
    })
}


//@note: To start a new fund 
$update
export function createNewFund(payload :initFundPayload) : Result<Message, string> {
    let expiryForThis = ic.time() + payload.duration;
    const message : Message = {id: id,addressRaiser: ic.caller(),createdAt: ic.time(),expiry: expiryForThis,active:true, ...payload}
    id++;
    FundStorage.insert(message.id.toString(),message)
    return(Result.Ok(message));

    
}


//@note:to pause a fund
$update
export function pauseFund(id: nat) :Result<Message,string>{
    return match(FundStorage.get(id.toString()),{
        Some:(message) =>{
            if(message.addressRaiser != ic.caller()){
                ic.trap("You are not the owner of this id");
            }
            const updateMessage = {...message,active : false};
            FundStorage.insert(id.toString(),updateMessage)
            return Result.Ok<Message,string>(message);
        },

        None: () => Result.Err<Message,string>("Id not found")
    })
}

//@note: To restart a fund
$update
export function restartFund(id: nat) :Result<Message,string>{
    return match(FundStorage.get(id.toString()),{
        Some:(message) =>{
            if(message.addressRaiser != ic.caller()){
                ic.trap("You are not the owner of this id");
            }
            const updateMessage = {...message,active : true};
            FundStorage.insert(id.toString(),updateMessage)
            return Result.Ok<Message,string>(message);
        },

        None: () => Result.Err<Message,string>("Id not found")
    })
}


$update
export async function donate(id:nat) : Promise<Result<string,string>>{
    return match(FundStorage.get(id.toString()),{
        Some: async(message) =>{
            if(message.active === false || message.expiry > ic.time()){
                throw `Either fund is not active or expiry has passed   `; 
            }

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

            }

            else{
                ic.trap("Fund the subAccount first")
            }


            return Result.Ok<string,string>("Funded");
        },

        None: () => Result.Err<string,string>("Id not found")
    })
}

$update
export async function withdrawFund(id:nat,transferAddress:Address) :  Promise<Result<string, string>> {

    return(match(FundStorage.get(id.toString()),{
        Some: async(message) =>{

            if(ic.caller() != message.addressRecepient){
                ic.trap("You cannot withdraw")
            }
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
                    to: binaryAddressFromAddress(transferAddress),
                    created_at_time: Opt.None


                }
            ).call()

            if(transferResult.Err){
                ic.trap(transferResult.Err.toString())
            }
            const updateMessage = {...message,amount : 0n};
            FundStorage.insert(id.toString(),updateMessage)




            return Result.Ok<string,string>("WithdrewFund");
        },

        None: () => Result.Err<string,string>("Id not found")
    }))

}

$query
export async function checkRaised(id:nat): Promise<Result<nat, string>>{
    return(match(FundStorage.get(id.toString()),{
        Some: async() => {
            let subAccount: blob = binaryAddressFromPrincipal(ic.id(),Number(id))
            const balance  = (await icpCanister.account_balance({account:subAccount}).call()).Ok?.e8s
            if(balance !== undefined){
                return Result.Ok<nat,string>(balance)
            }
            else{
                return Result.Ok<nat,string>(0n)
            }

        },

        None: () => Result.Err<nat,string>("Id not found")
    }))

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

 





