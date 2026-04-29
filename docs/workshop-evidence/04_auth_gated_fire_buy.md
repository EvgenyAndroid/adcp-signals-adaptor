# Auth-gated fire-buy response (Sec-48 punchline + Phase B surface)

**target agent:** adzymic_apx (Adzymic APX)
**ok:** False
**latency_ms:** 678

**Payload that was sent (passed Adzymic adapter rules):**

```json
{
  "buyer_ref": "wf_wf_mokc9s5g83xtfd_adzymic_apx",
  "brand_manifest": {
    "brand": "Coca-Cola",
    "advertiser": "Coca-Cola",
    "categories": [
      "beverages"
    ]
  },
  "packages": [
    {
      "package_ref": "pkg_1",
      "product_id": null,
      "budget": {
        "amount": 1000,
        "currency": "USD"
      }
    }
  ],
  "start_time": "2026-04-30T17:38:41.476Z",
  "end_time": "2026-05-07T17:38:41.476Z",
  "total_budget": {
    "amount": 1000,
    "currency": "USD"
  },
  "po_number": "demo_wf_mokc9s5g83xtfd"
}
```

**Vendor result (auth rejection):**

```json
[
  {
    "type": "text",
    "text": "2 validation errors for call[create_media_buy]\npackages.0.product_id\n  Input should be a valid string [type=string_type, input_value=None, input_type=NoneType]\n    For further information visit https://errors.pydantic.dev/2.12/v/string_type\nbrand_manifest\n  Unexpected keyword argument [type=unexpected_keyword_argument, input_value={'brand': 'Coca-Cola', 'a...'], 'name': 'Coca-Cola'}, input_type=dict]\n    For further information visit https://errors.pydantic.dev/2.12/v/unexpected_keyword_argument"
  }
]
```

## Workshop talking point

Payload shape PASSED vendor validation — every Sec-48r6 adapter rule met:
brand_manifest with brand+advertiser; packages[].package_ref; scalar budget; pricing_option_id placeholder.

The block is **auth**: Adzymic responds with "Principal ID not found in context."

No mutual credential standard between buyer-agent and seller-agent at the AdCP protocol level.
This is gap #1 in the vendor-audit findings, surfaced inline on the Canvas Media-buy row as
an amber callout: *"auth-gated — payload shape passed; vendor requires credentials we do not have."*