(function() {
    // Find all the "Expand all lines" buttons on the PR page
    const expandButtons = document.querySelectorAll('.js-expand-all-difflines-button');

    // Click each one
    expandButtons.forEach(button => {
        button.click();
    });

    console.log(`Expanded ${expandButtons.length} files.`);
})();
