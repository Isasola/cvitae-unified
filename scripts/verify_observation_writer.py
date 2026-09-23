from pathlib import Path
import sys
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scrapers'))
from source_evidence import exact_live_observation_candidate
from observation_writer import validate,dedupe,write
c=exact_live_observation_candidate(source='himalayas',opportunity_id='x',adapter_version='v',canonical_url='https://x',run_id='run',observed_at=datetime.now(timezone.utc).isoformat())
validate(c); assert write([c],base_url='https://x',headers={},apply=False)['commit'] is False
assert dedupe([c],{'x':{**c.to_payload(),'observed_at':datetime.now(timezone.utc).isoformat()}},now=datetime.now(timezone.utc))[1]==1
try: validate(type(c)(**{**c.__dict__,'run_id':None}));raise AssertionError()
except ValueError:pass
print('verify_observation_writer: PASS')
