/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/superpull_program.json`.
 */
export type SuperpullProgram = {
  "address": "6A6WedM2c3nne1oGVk9kpNjZHHqNGAf7P9B9aWHV4Hba",
  "metadata": {
    "name": "superpullProgram",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "getCurrentPrice",
      "discriminator": [
        82,
        101,
        90,
        124,
        192,
        68,
        89,
        159
      ],
      "accounts": [
        {
          "name": "auction"
        }
      ],
      "args": []
    },
    {
      "name": "initializeAuction",
      "discriminator": [
        37,
        10,
        117,
        197,
        208,
        88,
        117,
        62
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "collectionMint"
              }
            ]
          }
        },
        {
          "name": "merkleTree"
        },
        {
          "name": "collectionMint",
          "writable": true
        },
        {
          "name": "tokenMint",
          "docs": [
            "The mint of the token that will be accepted for payments"
          ]
        },
        {
          "name": "authority",
          "docs": [
            "The authority who will manage the auction (doesn't need to be signer)"
          ]
        },
        {
          "name": "payer",
          "docs": [
            "The account that will pay for the initialization"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "bubblegumProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "basePrice",
          "type": "u64"
        },
        {
          "name": "priceIncrement",
          "type": "u64"
        },
        {
          "name": "maxSupply",
          "type": "u64"
        },
        {
          "name": "minimumItems",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        }
      ]
    },
    {
      "name": "placeBid",
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bidderTokenAccount",
          "docs": [
            "The bidder's token account to transfer from"
          ],
          "writable": true
        },
        {
          "name": "auctionTokenAccount",
          "docs": [
            "The auction's token account to receive tokens"
          ],
          "writable": true
        },
        {
          "name": "collectionMint",
          "writable": true
        },
        {
          "name": "collectionMetadata",
          "writable": true
        },
        {
          "name": "collectionEdition",
          "writable": true
        },
        {
          "name": "collectionAuthorityRecordPda"
        },
        {
          "name": "merkleTree",
          "writable": true
        },
        {
          "name": "treeConfig",
          "writable": true
        },
        {
          "name": "treeCreator"
        },
        {
          "name": "bubblegumSigner",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  101,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  99,
                  112,
                  105
                ]
              }
            ],
            "program": {
              "kind": "account",
              "path": "bubblegumProgram"
            }
          }
        },
        {
          "name": "tokenMetadataProgram"
        },
        {
          "name": "compressionProgram"
        },
        {
          "name": "logWrapper"
        },
        {
          "name": "bubblegumProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "refund",
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bidderTokenAccount",
          "docs": [
            "The bidder's token account to receive refund"
          ],
          "writable": true
        },
        {
          "name": "auctionTokenAccount",
          "docs": [
            "The auction's token account to refund from"
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true
        },
        {
          "name": "authority",
          "docs": [
            "The authority who can authorize the withdrawal and receive the funds"
          ],
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "authorityTokenAccount",
          "docs": [
            "The authority's token account to receive the withdrawn tokens"
          ],
          "writable": true
        },
        {
          "name": "auctionTokenAccount",
          "docs": [
            "The auction's token account to withdraw from"
          ],
          "writable": true
        },
        {
          "name": "payer",
          "docs": [
            "The account that will pay for the transaction"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "auctionState",
      "discriminator": [
        252,
        227,
        205,
        147,
        72,
        64,
        250,
        126
      ]
    },
    {
      "name": "bidState",
      "discriminator": [
        155,
        197,
        5,
        97,
        189,
        60,
        8,
        183
      ]
    }
  ],
  "events": [
    {
      "name": "auctionGraduated",
      "discriminator": [
        92,
        21,
        127,
        141,
        141,
        109,
        10,
        141
      ]
    },
    {
      "name": "auctionInitialized",
      "discriminator": [
        18,
        7,
        64,
        239,
        134,
        184,
        173,
        108
      ]
    },
    {
      "name": "bidPlaced",
      "discriminator": [
        135,
        53,
        176,
        83,
        193,
        69,
        108,
        61
      ]
    },
    {
      "name": "bidRefunded",
      "discriminator": [
        197,
        100,
        31,
        186,
        67,
        28,
        46,
        103
      ]
    },
    {
      "name": "fundsWithdrawn",
      "discriminator": [
        56,
        130,
        230,
        154,
        35,
        92,
        11,
        118
      ]
    },
    {
      "name": "priceUpdate",
      "discriminator": [
        222,
        51,
        180,
        226,
        165,
        188,
        203,
        54
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Math operation overflowed"
    },
    {
      "code": 6001,
      "name": "invalidBasePrice",
      "msg": "Base price must be greater than zero"
    },
    {
      "code": 6002,
      "name": "invalidPriceIncrement",
      "msg": "Price increment must be greater than zero"
    },
    {
      "code": 6003,
      "name": "invalidMaxSupply",
      "msg": "Maximum supply must be greater than zero"
    },
    {
      "code": 6004,
      "name": "invalidMinimumItems",
      "msg": "Minimum items must be greater than zero and less than max supply"
    },
    {
      "code": 6005,
      "name": "invalidMerkleTree",
      "msg": "Invalid merkle tree configuration"
    },
    {
      "code": 6006,
      "name": "insufficientBidAmount",
      "msg": "Bid amount is less than current price"
    },
    {
      "code": 6007,
      "name": "maxSupplyReached",
      "msg": "Maximum supply reached"
    },
    {
      "code": 6008,
      "name": "invalidBidAmount",
      "msg": "Invalid bid amount provided"
    },
    {
      "code": 6009,
      "name": "invalidBidder",
      "msg": "Bidder cannot be the zero address"
    },
    {
      "code": 6010,
      "name": "unauthorizedWithdraw",
      "msg": "Unauthorized withdrawal attempt"
    },
    {
      "code": 6011,
      "name": "notGraduated",
      "msg": "Auction must be graduated to withdraw funds"
    },
    {
      "code": 6012,
      "name": "noFundsToWithdraw",
      "msg": "No funds available to withdraw"
    },
    {
      "code": 6013,
      "name": "insufficientRentBalance",
      "msg": "Cannot withdraw below rent-exempt balance"
    },
    {
      "code": 6014,
      "name": "excessiveWithdrawalAmount",
      "msg": "Withdrawal amount exceeds available balance"
    },
    {
      "code": 6015,
      "name": "alreadyGraduated",
      "msg": "Auction has already graduated"
    },
    {
      "code": 6016,
      "name": "minimumItemsNotReached",
      "msg": "Auction has not reached minimum items"
    },
    {
      "code": 6017,
      "name": "invalidAuctionState",
      "msg": "Invalid auction state"
    },
    {
      "code": 6018,
      "name": "invalidAuthority",
      "msg": "Invalid authority provided"
    },
    {
      "code": 6019,
      "name": "invalidAccountOwner",
      "msg": "Invalid account owner"
    },
    {
      "code": 6020,
      "name": "notRentExempt",
      "msg": "Account is not rent exempt"
    },
    {
      "code": 6021,
      "name": "invalidDeadline",
      "msg": "Invalid deadline"
    },
    {
      "code": 6022,
      "name": "auctionExpired",
      "msg": "Auction expired"
    },
    {
      "code": 6023,
      "name": "invalidRefundAttempt",
      "msg": "Cannot refund when auction is graduated or deadline not reached"
    },
    {
      "code": 6024,
      "name": "noFundsToRefund",
      "msg": "No bid amount to refund"
    },
    {
      "code": 6025,
      "name": "nftBurnError",
      "msg": "Failed to burn NFT during refund"
    }
  ],
  "types": [
    {
      "name": "auctionGraduated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "totalItems",
            "type": "u64"
          },
          {
            "name": "totalValueLocked",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "auctionInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "merkleTree",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "collectionMint",
            "type": "pubkey"
          },
          {
            "name": "basePrice",
            "type": "u64"
          },
          {
            "name": "priceIncrement",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "minimumItems",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "auctionState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "merkleTree",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "collectionMint",
            "type": "pubkey"
          },
          {
            "name": "basePrice",
            "type": "u64"
          },
          {
            "name": "priceIncrement",
            "type": "u64"
          },
          {
            "name": "currentSupply",
            "type": "u64"
          },
          {
            "name": "maxSupply",
            "type": "u64"
          },
          {
            "name": "totalValueLocked",
            "type": "u64"
          },
          {
            "name": "minimumItems",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "isGraduated",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bidPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "newSupply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "bidRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "bidState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "fundsWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "supply",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
