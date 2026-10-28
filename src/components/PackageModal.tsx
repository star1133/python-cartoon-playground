import React from 'react';
import { X, Package, Check, Download, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import {
  CURATED_PACKAGES,
  BROWSER_LIMITATIONS,
  type PackageInfo,
} from '../storage/packageCatalog';

interface PackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  installedPackages: Set<string>;
  onInstallPackage: (packageName: string) => Promise<void>;
  installingPackage: string | null;
}

export const PackageModal: React.FC<PackageModalProps> = ({
  isOpen,
  onClose,
  installedPackages,
  onInstallPackage,
  installingPackage,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-package-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '88vh',
          background: '#252526',
          borderRadius: '8px',
          border: '1px solid #3e3e42',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#cccccc',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderBottom: '1px solid #333333',
            background: '#1e1e1e',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={18} style={{ color: '#4fc1ff' }} aria-hidden="true" />
            <h2 id="modal-package-title" style={{ margin: 0, fontSize: '15px', color: '#ffffff', fontWeight: 600 }}>
              จัดการแพ็กเกจและข้อจำกัดในเบราว์เซอร์
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#858585',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section: แพ็กเกจยอดนิยมที่เข้ากันได้ */}
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#ffffff', fontWeight: 600 }}>
              แพ็กเกจ CPython / Pyodide ที่เข้ากันได้ (Curated Packages)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {CURATED_PACKAGES.map((pkg) => {
                const isInstalled = installedPackages.has(pkg.name);
                const isInstalling = installingPackage === pkg.name;

                return (
                  <div
                    key={pkg.name}
                    className="package-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: '#1e1e1e',
                      borderRadius: '6px',
                      border: '1px solid #333333',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, color: '#4fc1ff', fontSize: '13px', fontFamily: 'monospace' }}>
                          {pkg.name}
                        </span>
                        <span style={{ fontSize: '11px', color: '#858585' }}>{pkg.version}</span>
                        <span style={{ fontSize: '11px', color: '#858585' }}>({pkg.sizeEstimate})</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#aaaaaa', marginTop: '3px' }}>
                        {pkg.descriptionTh}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isInstalled || isInstalling}
                      onClick={() => onInstallPackage(pkg.name)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: isInstalled ? '1px solid #2ea043' : 'none',
                        background: isInstalled ? 'rgba(46, 160, 67, 0.15)' : '#007acc',
                        color: isInstalled ? '#2ea043' : '#ffffff',
                        fontSize: '12px',
                        cursor: isInstalled || isInstalling ? 'default' : 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      {isInstalled ? (
                        <>
                          <Check size={13} aria-hidden="true" />
                          <span>ติดตั้งแล้ว</span>
                        </>
                      ) : isInstalling ? (
                        <span>กำลังติดตั้ง...</span>
                      ) : (
                        <>
                          <Download size={13} aria-hidden="true" />
                          <span>ติดตั้ง</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: ข้อจำกัดตามความจริงของเบราว์เซอร์ */}
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#ffffff', fontWeight: 600 }}>
              ข้อเท็จจริงและข้อจำกัดของ Python ในเบราว์เซอร์ (Limitation Truth)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {BROWSER_LIMITATIONS.map((lim, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: '#1e1e1e',
                    border: '1px solid #333333',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ marginTop: '2px' }}>
                    {lim.severity === 'restricted' ? (
                      <ShieldAlert size={16} style={{ color: '#f14c4c' }} aria-hidden="true" />
                    ) : lim.severity === 'warning' ? (
                      <AlertTriangle size={16} style={{ color: '#cca700' }} aria-hidden="true" />
                    ) : (
                      <Info size={16} style={{ color: '#4fc1ff' }} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#e0e0e0' }}>
                      {lim.titleTh}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999999', marginTop: '2px', lineHeight: '1.4' }}>
                      {lim.detailTh}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '10px 18px',
            background: '#1e1e1e',
            borderTop: '1px solid #333333',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: '#333333',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
