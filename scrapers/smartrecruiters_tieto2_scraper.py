"""Company-scoped entrypoint for Tieto Tech Consulting SmartRecruiters jobs."""
from smartrecruiters_scraper import main as run_company

SOURCE = "smartrecruiters_tieto2"


def main() -> int:
    return run_company(default_company="Tieto2")

if __name__ == "__main__":
    raise SystemExit(main())
