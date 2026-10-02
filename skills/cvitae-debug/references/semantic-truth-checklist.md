# Semantic truth checklist

For each material claim record:

`claim | evidence | producer branch | normalized value | provenance | create |
update | no-op | historical | entrypoint | persistence | consumer | failure |
recovery | state`

Before accepting a verifier, make it fail on an expected negative or adversarial
fixture. For shared primitives, first list every caller and every downstream
consumer. A field mapping proves structural survival only; it cannot prove
semantic truth or provenance preservation.
