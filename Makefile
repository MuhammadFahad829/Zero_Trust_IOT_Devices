.PHONY: test-enforcement cron-install

# Run the automated enforcement test (requires sudo). Logs to /var/log/zerotrust-enforcement-test.log
test-enforcement:
	@echo "Running enforcement test (requires sudo)..."
	@sudo bash infra/scripts/enforcement_test.sh 2>&1 | sudo tee -a /var/log/zerotrust-enforcement-test.log

# Install a cron job that runs the enforcement test daily at 03:30.
# This writes the crontab entry for the current user. Review before enabling.
cron-install:
	@echo "# Run enforcement test daily at 03:30" > /tmp/zerotrust_cron.tmp
	@echo "30 3 * * * cd $(shell pwd) && sudo bash infra/scripts/enforcement_test.sh >> /var/log/zerotrust-enforcement-test.log 2>&1" >> /tmp/zerotrust_cron.tmp
	@crontab -l 2>/dev/null | grep -v zerotrust-enforcement-test.log || true
	@crontab /tmp/zerotrust_cron.tmp || (crontab -l 2>/dev/null; cat /tmp/zerotrust_cron.tmp) | crontab -
	@rm -f /tmp/zerotrust_cron.tmp
	@echo "Cron job installed (verify with 'crontab -l')."
