# Sample DTS label with policy_attestations (Phase D)

**signal:** Gender: Female Adults
**dts_version:** 1.2
**privacy_compliance_mechanisms:** ['GPP', 'MSPA']

**policy_attestations[]: 8 entries**
  - us_coppa                  -> compliant          (Children's data filtered at ingestion per documented process.)
  - csbs                      -> compliant          (Common Sense Brand Standards adherence.)
  - eu_gdpr_advertising       -> out_of_scope       (Provider does not process EU resident data.)
  - uk_hfss                   -> not_applicable     (US-only addressable; no UK ad surface.)
  - ca_sb_942                 -> out_of_scope       (No AI-generated content in signal payloads.)
  - tobacco_nicotine          -> out_of_scope       (Tobacco / nicotine excluded at source.)
  - us_cannabis               -> out_of_scope       (Cannabis excluded at source.)
  - political_advertising     -> out_of_scope       (Political segments not sourced.)
