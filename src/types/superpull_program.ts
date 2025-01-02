/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/superpull_program.json`.
 */
export type SuperpullProgram = {
  "address": "EDX7DLx7YwQFFMC9peZh5nDqiB4bKVpa2SpvSfwz4XUG",
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
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [],
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
                "path": "merkleTree"
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "merkleTree",
          "docs": [
            "The merkle tree that contains the compressed NFT"
          ]
        },
        {
          "name": "authority",
          "docs": [
            "The authority who can manage the auction"
          ],
          "writable": true,
          "signer": true
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
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
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
    }
  ],
  "events": [
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
      "name": "insufficientBidAmount",
      "msg": "Bid amount is less than current price"
    },
    {
      "code": 6001,
      "name": "maxSupplyReached",
      "msg": "Maximum supply reached"
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
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
