import { Suspense } from 'react';
import CartRecovery from '../../components/CartRecovery';

/**
 * Cart Recovery Page
 * Handles abandoned cart recovery from email links
 */
export default function CartRecoveryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Loading...
              </h2>
            </div>
          </div>
        </div>
      </div>
    }>
      <CartRecovery />
    </Suspense>
  );
}

export const metadata = {
  title: 'Cart Recovery - Noiraé Store',
  description: 'Restore your abandoned cart and complete your purchase',
};