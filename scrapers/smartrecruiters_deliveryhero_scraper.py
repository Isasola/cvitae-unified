"""Company-scoped entrypoint for Delivery Hero / PedidosYa SmartRecruiters jobs."""
from smartrecruiters_scraper import main as run_company

SOURCE = "smartrecruiters_deliveryhero"


def main() -> int:
    return run_company(default_company="deliveryhero")

if __name__ == "__main__":
    raise SystemExit(main())
