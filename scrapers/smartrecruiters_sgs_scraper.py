"""Company-scoped entrypoint for SGS Paraguay SmartRecruiters jobs."""
from smartrecruiters_scraper import main as run_company

SOURCE = "smartrecruiters_sgs"


def main() -> int:
    return run_company(default_company="SGS")

if __name__ == "__main__":
    raise SystemExit(main())
