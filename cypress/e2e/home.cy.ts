describe('The Home Page', () => {
  it('successfully loads', () => {
    cy.visit('/');
    cy.contains('Prototypes for monitoring and analysis view');
  });
});
