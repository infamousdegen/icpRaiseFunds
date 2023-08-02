# LocalNetworkTesting 

**The following steps has to be performed when testing this application on the local test network**

Step 1: **dfx deploy** this will deploy two canisters one is token canister this will act as our dummy token which will be used to raise funds , withdraw etc and the other is **fundRaiser** which will be our main entry point canister

Step2: **Initialise the fundRaiser** call the "initialise" function with first parameter as the network (whether local network or the mainnet), as we are testing on the local test network we pass in 0 and second paremeter the Principal of token canister which we deployed in the previous step 

Step 3: **IntializeBalance** call this function to "mint" some test tokens to this canister 

Step 4: **getFaucetTokens** This function will transfer some tokens to the caller so he can test out the donate and other functions where tokens are requries 

Step 5: **createNewFund** : This is the main function to createNewFund . The caller can create new "fund" which will store important details such as how much funds was raise , expiry and other details . Take note of the **id** as this will be required for other parts of the functions 
         
         Parameters: 
                duration : in nanseconds on how long the fund should run (eg: if it is 1 day then 1 day in nanoseconds as to be passed)
                addressRecepient: For whom you are raising the funds for (only this address can withdraw in the end ) if you are raising for yoursel pass in your address
                amount : The total amount you want to raise

Step 6: **donate**: A user can donate to a fund by calling this function 
                    
                Parameters:
                        id: The id of the fund you want to fund 
                        amount: The amount you want to fund 

Step 7: **withdrawFund**: Once the target amount has reached the user can withdraw the funds 
                        
                        Parameters:
                            id: the id of the fund you want to withdraw (note: checks are done to make sure only valid user are allowed to call the contract)
                            transferAddress: the address to which the you want to transfer the funds 

## Misc Functions 

**checkRaised**: To check the total amount raised so far for a particular fund 
                Parameters:
                    id: The id of the fund

**getAllFunds**: Returns all the details of all the funds 

**pauseFund**: If for some reason you want to pause a fund you can call this function 
            Parameters: 
                id: The id of the fund 

**restartFund**: If you want to restart the fund again once paused 

**updateDuration**: If you want to change the duration of the fund . Note: This will take calculate from the time of fund creation 
            Parameters:
                id: The id of the fund 
                duration : nanoseconds 


# Mainnet Deployment

Make sure to reaplce the **icpCanister** with the principal address of the tokenw with which you will be interacting with 

Step1: **Initialise the fundRaiser** call the "initialise" function with first parameter as the network (whether local network or the mainnet), as we are testing on the main network we pass in 1 and second parameter as the token address with which you will be interacting with 

Step2: The rest of the flow such as createFund and donate can be performed normall as mentioned above 

